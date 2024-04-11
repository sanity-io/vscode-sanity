import * as vscode from 'vscode'
import * as path from 'path'
import os from 'os'
import { promises as fs } from 'fs'
import osenv from 'osenv'
import xdgBasedir from 'xdg-basedir'

export interface Config {
  projectId: string
  dataset: string
  token?: string
}

type ConfigFileName = 'sanity.cli.ts' | 'sanity.cli.js' | 'sanity.json'

export async function loadConfig(basePath: string): Promise<Config | false> {
  let dir = basePath
  let configFile = await hasConfig(dir)
  while (!configFile) {
    const parent = path.dirname(dir)
    if (!dir || parent === dir) {
      // last ditch effort, check if we are in a studio monorepo
      const folders = vscode?.workspace?.workspaceFolders || []
      dir = (folders.length && folders[0].uri.fsPath + '/studio') || '/'
      configFile = await hasConfig(dir)
      if (!configFile) {
        return false
      }
    } else {
      dir = parent
    }
  }

  if (configFile === 'sanity.cli.ts' || configFile === 'sanity.cli.js') {
    throw new Error('Sanity Studio V3 is not supported in this extension')
  }

  const configContent = await fs.readFile(path.join(dir, configFile), 'utf8')
  const config = parseJson(configContent)
  if (!config || !config.api || !config.api.projectId) {
    return false
  }

  const cliConfigContent = await fs.readFile(getGlobalConfigLocation(), 'utf8')
  const cliConfig = parseJson(cliConfigContent)

  return cliConfig ? { ...config.api, token: cliConfig.authToken } : config.api
}

async function hasConfig(dir: string): Promise<ConfigFileName | undefined> {
  const configFiles: ConfigFileName[] = ['sanity.cli.ts', 'sanity.cli.js', 'sanity.json']
  for (const configFile of configFiles) {
    const exists = await fs
      .stat(path.join(dir, configFile))
      .then(() => true)
      .catch(() => false)
    if (exists) {
      return configFile
    }
  }
  return undefined
}

function parseJson(content: string) {
  try {
    return JSON.parse(content)
  } catch (err) {
    return false
  }
}

function getGlobalConfigLocation() {
  const user = (osenv.user() || 'user').replace(/\\/g, '')
  const configDir = xdgBasedir.config || path.join(os.tmpdir(), user, '.config')
  return path.join(configDir, 'sanity', 'config.json')
}
