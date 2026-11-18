import path from 'node:path'
import type {FragmentHost} from './types'

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']
// TypeScript lets `./a.js` stand for `./a.ts`.
const EMITTED_EXTENSIONS = new Map([
  ['.js', ['.ts', '.tsx']],
  ['.jsx', ['.tsx']],
  ['.mjs', ['.mts']],
  ['.cjs', ['.cts']],
])

export interface PathMapping {
  /** Directory the targets are relative to. */
  base: string
  /** Whether `base` comes from an explicit `baseUrl`, so bare specifiers may resolve from it. */
  hasBaseUrl: boolean
  paths: Record<string, Array<string>>
}

/** Removes comments and trailing commas so a tsconfig.json parses as JSON. */
function stripJsonc(text: string): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    const char = text[i]
    if (char === '"') {
      let j = i + 1
      while (j < text.length && text[j] !== '"') {
        j += text[j] === '\\' ? 2 : 1
      }
      out += text.slice(i, j + 1)
      i = j + 1
    } else if (char === '/' && text[i + 1] === '/') {
      const newline = text.indexOf('\n', i)
      i = newline === -1 ? text.length : newline
    } else if (char === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2)
      i = close === -1 ? text.length : close + 2
    } else {
      out += char
      i++
    }
  }
  return out.replaceAll(/,(\s*[}\]])/g, '$1')
}

export async function readPathMapping(
  fromFile: string,
  host: FragmentHost,
): Promise<PathMapping | undefined> {
  let dir = path.dirname(fromFile)
  for (;;) {
    for (const name of ['tsconfig.json', 'jsconfig.json']) {
      const text = await host.readFile(path.join(dir, name))
      if (text === undefined) {
        continue
      }
      try {
        const {compilerOptions} = JSON.parse(stripJsonc(text))
        const paths = compilerOptions?.paths
        if (paths && typeof paths === 'object') {
          return {
            base: path.resolve(dir, compilerOptions.baseUrl ?? '.'),
            hasBaseUrl: Boolean(compilerOptions.baseUrl),
            paths,
          }
        }
        if (compilerOptions?.baseUrl) {
          return {base: path.resolve(dir, compilerOptions.baseUrl), hasBaseUrl: true, paths: {}}
        }
      } catch {
        // A tsconfig that does not parse maps nothing.
      }
      return undefined
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      return undefined
    }
    dir = parent
  }
}

/** The text a `*` in the pattern stands for, '' for a pattern without one, undefined if no match. */
function matchPattern(pattern: string, specifier: string): string | undefined {
  const star = pattern.indexOf('*')
  if (star === -1) {
    return specifier === pattern ? '' : undefined
  }
  const prefix = pattern.slice(0, star)
  const suffix = pattern.slice(star + 1)
  if (specifier.length < prefix.length + suffix.length) {
    return undefined
  }
  if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) {
    return undefined
  }
  return specifier.slice(prefix.length, specifier.length - suffix.length)
}

/** Where the `paths` of the mapping send the specifier, the most specific pattern first like TypeScript. */
export function pathCandidates(specifier: string, mapping: PathMapping): Array<string> {
  const matches: Array<{prefixLength: number; targets: Array<string>; matched: string}> = []
  for (const [pattern, targets] of Object.entries(mapping.paths)) {
    const matched = matchPattern(pattern, specifier)
    if (matched === undefined || !Array.isArray(targets)) {
      continue
    }
    matches.push({prefixLength: pattern.indexOf('*') === -1 ? pattern.length : pattern.indexOf('*'), targets, matched})
  }
  matches.sort((a, b) => b.prefixLength - a.prefixLength)
  return matches.flatMap(({targets, matched}) =>
    targets.map((target) => path.resolve(mapping.base, String(target).replace('*', matched))),
  )
}

function mapThroughPaths(specifier: string, mapping: PathMapping): Array<string> {
  const candidates = pathCandidates(specifier, mapping)
  // `baseUrl` alone also makes `lib/queries` resolve from the base.
  candidates.push(path.resolve(mapping.base, specifier))
  return candidates
}

async function firstReadable(base: string, host: FragmentHost): Promise<string | undefined> {
  const ext = path.extname(base)
  const candidates = [
    base,
    ...(EMITTED_EXTENSIONS.get(ext) ?? []).map(
      (replacement) => base.slice(0, -ext.length) + replacement,
    ),
    ...SOURCE_EXTENSIONS.map((extension) => base + extension),
    ...SOURCE_EXTENSIONS.map((extension) => path.join(base, 'index' + extension)),
  ]
  for (const candidate of candidates) {
    if ((await host.readFile(candidate)) !== undefined) {
      return candidate
    }
  }
  return undefined
}

/**
 * Finds the file an import specifier points to: relative paths, plus the `paths` and `baseUrl`
 * of the nearest tsconfig.json or jsconfig.json. Packages in node_modules are not followed.
 */
export async function resolveImport(
  fromFile: string,
  specifier: string,
  host: FragmentHost,
): Promise<string | undefined> {
  if (specifier.startsWith('.')) {
    return firstReadable(path.resolve(path.dirname(fromFile), specifier), host)
  }

  const mapping = await readPathMapping(fromFile, host)
  if (!mapping) {
    return undefined
  }
  for (const candidate of mapThroughPaths(specifier, mapping)) {
    const found = await firstReadable(candidate, host)
    if (found) {
      return found
    }
  }
  return undefined
}
