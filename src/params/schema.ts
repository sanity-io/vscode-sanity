import {promises as fs} from 'node:fs'
import path from 'node:path'
import {getTsconfig} from 'get-tsconfig'
import type {SchemaType} from 'groq-js'

export const CONTENT_MAPPER_PACKAGE = '@sanity-labs/groq-content-mapper'
const DEFAULT_SCHEMA_FILE = 'schema.json'

interface JsonFields {
  contentMappers?: unknown
  type?: unknown
  name?: unknown
  package?: unknown
  options?: unknown
  schema?: unknown
  schemas?: unknown
  include?: unknown
  path?: unknown
}

function isJson(value: unknown): value is JsonFields {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSchema(value: unknown): value is SchemaType {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isJson(entry) &&
        (entry.type === 'document' || entry.type === 'type') &&
        typeof entry.name === 'string',
    )
  )
}

const GLOB_CHARACTERS = /[*?]/

function globSegmentToRegExp(segment: string): string {
  return segment
    .split('')
    .map((char) =>
      char === '*'
        ? '[^/]*'
        : char === '?'
          ? '[^/]'
          : char.replaceAll(/[\\^$.*+?()[\]{}|]/g, String.raw`\$&`),
    )
    .join('')
}

function globToRegExp(glob: string): RegExp {
  const segments = glob.split('/')
  const source = segments
    .map((segment, index) => {
      const last = index === segments.length - 1
      if (segment === '**') {
        return last ? '.*' : '(?:.*/)?'
      }
      return globSegmentToRegExp(segment) + (last ? '' : '/')
    })
    .join('')
  return new RegExp(`^${source}$`)
}

/**
 * How deep the folder or glob `include` (relative to `root`) contains `file`, or -1. A glob counts
 * as its folder before the first wildcard, and a glob that matches a folder includes everything
 * under it, like the mapper does it. Only `*`, `**` and `?` are understood in globs.
 */
function includeDepth(include: string, root: string, file: string): number {
  const segments = include.replaceAll('\\', '/').split('/')
  const wildcard = segments.findIndex((segment) => GLOB_CHARACTERS.test(segment))
  const base = path.resolve(root, ...(wildcard === -1 ? segments : segments.slice(0, wildcard)))
  const relative = path.relative(base, file)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return -1
  }
  if (wildcard === -1) {
    return base.length
  }

  const matches = globToRegExp(segments.slice(wildcard).join('/'))
  const parts = relative.split(path.sep)
  for (let count = 1; count <= parts.length; count++) {
    if (matches.test(parts.slice(0, count).join('/'))) {
      return base.length
    }
  }
  return -1
}

/**
 * The schema file groq-content-mapper types `file` against: the `schemas` entry of its
 * `contentMappers` options in the nearest tsconfig.json whose folder is deepest around the file,
 * else its `schema`. Paths are relative to the tsconfig, which may inherit the mapper's entry
 * through `extends`. A tsconfig that cannot be read gives no schema, so that it never breaks
 * running a query.
 */
export function findMapperSchemaPath(file: string): string | undefined {
  let tsconfig: ReturnType<typeof getTsconfig>
  try {
    tsconfig = getTsconfig(path.dirname(file), 'tsconfig.json', new Map())
  } catch {
    return undefined
  }
  if (!tsconfig) {
    return undefined
  }

  const parsed: unknown = tsconfig.config
  if (!isJson(parsed)) {
    return undefined
  }
  const {contentMappers} = parsed
  const entry = Array.isArray(contentMappers)
    ? contentMappers.find((each) => isJson(each) && each.package === CONTENT_MAPPER_PACKAGE)
    : undefined
  const options = isJson(entry) && isJson(entry.options) ? entry.options : undefined
  if (!options) {
    return undefined
  }

  const root = path.dirname(tsconfig.path)
  let best: {schema: string; depth: number} | undefined
  if (Array.isArray(options.schemas)) {
    for (const scope of options.schemas) {
      if (!isJson(scope) || typeof scope.schema !== 'string' || !scope.schema) {
        continue
      }
      const includes = Array.isArray(scope.include) ? scope.include : [scope.include]
      for (const include of includes) {
        if (typeof include !== 'string' || !include) {
          continue
        }
        const depth = includeDepth(include, root, file)
        if (depth > (best?.depth ?? -1)) {
          best = {schema: scope.schema, depth}
        }
      }
    }
  }

  const schema = best?.schema ?? (typeof options.schema === 'string' ? options.schema : undefined)
  return schema ? path.resolve(root, schema) : undefined
}

/**
 * Where `sanity schema extract` writes the schema for the project whose sanity.cli.ts is in
 * `configDir`: `schemaExtraction.path`, `./schema.json` by default.
 */
export function cliSchemaPath(configDir: string, schemaExtraction: unknown): string {
  const configured = isJson(schemaExtraction) ? schemaExtraction.path : undefined
  if (typeof configured !== 'string' || !configured) {
    return path.join(configDir, DEFAULT_SCHEMA_FILE)
  }
  const resolved = path.resolve(configDir, configured)
  return path.extname(resolved) === '' ? path.join(resolved, DEFAULT_SCHEMA_FILE) : resolved
}

/**
 * Reads the first of `files` that is an extracted schema (`sanity schema extract`). One that is
 * missing, unreadable or not a schema is skipped, so that it never breaks running a query.
 */
export async function loadSchemaFrom(files: Array<string>): Promise<SchemaType | undefined> {
  for (const file of files) {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(file, 'utf8'))
      if (isSchema(parsed)) {
        return parsed
      }
    } catch {
      // missing or unreadable: try the next file
    }
  }
  return undefined
}

/**
 * The schema of the project `file` belongs to: the one groq-content-mapper is configured with for
 * it, else the one `sanity schema extract` writes for the sanity.cli.ts in `configDir`.
 */
export function loadProjectSchema(options: {
  file: string | undefined
  configDir: string
  schemaExtraction: unknown
}): Promise<SchemaType | undefined> {
  const mapperSchema = options.file ? findMapperSchemaPath(options.file) : undefined
  return loadSchemaFrom([
    ...(mapperSchema ? [mapperSchema] : []),
    cliSchemaPath(options.configDir, options.schemaExtraction),
  ])
}
