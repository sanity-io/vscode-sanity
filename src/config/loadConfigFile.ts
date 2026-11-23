import path from 'node:path'
import {clearRequireCache} from '../clearRequireCache'
import {withConfigEnv} from './env'
import type {Config} from './findConfig'

/**
 * Loads a `sanity.cli.ts` file and returns its default export.
 *
 * Sucrase compiles it to CommonJS. Node 22 can strip types itself, but it then loads the file as
 * an ES module: named imports from CommonJS packages such as `sanity/cli` in Sanity v3 fail, and
 * after one failed load every retry throws "Unexpected module status 0".
 */
export async function loadConfigFile(configFilePath: string): Promise<Config> {
  // Sucrase compiles local .ts imports too, and those stay cached after the hook is removed.
  clearRequireCache(require.resolve(configFilePath))

  // The extension host is shared with other extensions, so only hook `.ts` while loading the config.
  // The same goes for the `.env` files the Sanity CLI loads for it, see withConfigEnv.
  // Sucrase is imported here, not at the top, to keep activation fast.
  const {registerTS} = await import('sucrase/dist/register')
  const revertTsHook = registerTS()
  try {
    const loaded = withConfigEnv(path.dirname(configFilePath), () =>
      requireConfigModule(configFilePath),
    )
    if (!loaded) {
      throw new Error(`${configFilePath} has no default export`)
    }
    return loaded.default
  } finally {
    revertTsHook()
  }
}

interface ConfigModule {
  default: Config
}

function requireConfigModule(configFilePath: string): ConfigModule | undefined {
  // sanity.cli.ts is a file the user wrote. It is loaded by path, so it cannot be a static import.
  // oxlint-disable-next-line @typescript-eslint/no-require-imports
  const loaded: unknown = require(configFilePath)
  return hasDefaultExport(loaded) ? loaded : undefined
}

function hasDefaultExport(value: unknown): value is ConfigModule {
  return typeof value === 'object' && value !== null && 'default' in value
}
