import {readFileSync, statSync} from 'node:fs'
import path from 'node:path'
import {parseEnv} from 'node:util'
import {expand} from 'dotenv-expand'

/**
 * The mode the Sanity CLI loads `.env.<mode>` files for: `SANITY_ACTIVE_ENV` when set, `production`
 * when `NODE_ENV` is `production`, and `development` otherwise. `sanity build` and `sanity deploy`
 * also use `production`, but a config is read here for running queries, like `sanity dev`.
 */
export function getEnvMode(env: NodeJS.ProcessEnv = process.env): string {
  return env.SANITY_ACTIVE_ENV || (env.NODE_ENV === 'production' ? 'production' : 'development')
}

/** The files the Sanity CLI reads, in order. Later files win over earlier ones. */
export function getEnvFiles(dir: string, mode: string): Array<string> {
  const files = ['.env', '.env.local']
  // "local" is the suffix of .env.local, so it cannot also be the name of a mode.
  if (mode !== 'local') {
    files.push(`.env.${mode}`, `.env.${mode}.local`)
  }
  return files.map((file) => path.join(dir, file))
}

function isFile(file: string): boolean {
  try {
    const stat = statSync(file)
    return stat.isFile() || stat.isFIFO()
  } catch {
    return false
  }
}

/**
 * Reads the variables the Sanity CLI makes available to `sanity.cli.ts`: the `.env*` files next to
 * it, with `$VAR` references expanded. Variables that are already set win over the files. Returns
 * only the ones that are not already set.
 */
export function readConfigEnv(
  dir: string,
  mode: string = getEnvMode(),
  baseEnv: NodeJS.ProcessEnv = process.env
): Record<string, string> {
  const parsed: Record<string, string> = {}
  for (const file of getEnvFiles(dir, mode)) {
    if (isFile(file)) {
      Object.assign(parsed, parseEnv(readFileSync(file, 'utf8')))
    }
  }

  const processEnv: Record<string, string> = {}
  for (const [key, value] of Object.entries(baseEnv)) {
    if (value !== undefined) {
      processEnv[key] = value
    }
  }
  expand({parsed, processEnv})

  return Object.fromEntries(Object.entries(parsed).filter(([key]) => baseEnv[key] === undefined))
}

/**
 * Runs `callback` with the variables from {@link readConfigEnv} set on `process.env`, then puts
 * `process.env` back as it was. The Sanity CLI sets them for good, but the extension host is shared
 * with other extensions, so they only exist while the config is evaluated. The callback has to be
 * synchronous for that to be true: nothing else can run in between.
 */
export function withConfigEnv<T>(
  dir: string,
  callback: () => T,
  env: NodeJS.ProcessEnv = process.env
): T {
  const added = readConfigEnv(dir, getEnvMode(env), env)
  Object.assign(env, added)
  try {
    return callback()
  } finally {
    for (const key of Object.keys(added)) {
      delete env[key]
    }
  }
}
