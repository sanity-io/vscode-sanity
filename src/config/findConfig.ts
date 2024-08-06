import * as vscode from 'vscode'
import * as path from 'path'
import os from 'os'
import {promises as fs} from 'fs'
import osenv from 'osenv'
import xdgBasedir from 'xdg-basedir'

export interface Config {
  api: {
    projectId: string
    dataset: string
    token?: string
  }
}

export async function loadConfig(basePath: string): Promise<Config | false> {
  let dir = basePath
  while (!(await hasConfig(dir))) {
    const parent = path.dirname(dir)
    if (!dir || parent === dir) {
      // last ditch effort, check if we are in a studio monorepo
      const folders = vscode?.workspace?.workspaceFolders || []
      dir = (folders.length && folders[0].uri.fsPath + '/studio') || '/'
      if (!(await hasConfig(dir))) {
        return false
      }
    } else {
      dir = parent
    }
  }

  const configContent = await fs.readFile(path.join(dir, 'sanity.json'), 'utf8')
  const config = parseJson(configContent)
  if (!config || !config.api || !config.api.projectId) {
    return false
  }

  const cliConfigContent = await fs.readFile(getGlobalConfigLocation(), 'utf8')
  const cliConfig = parseJson(cliConfigContent)

  return cliConfig ? {...config.api, token: cliConfig.authToken} : config.api
}

async function hasConfig(dir: string): Promise<boolean> {
  return fs
    .stat(path.join(dir, 'sanity.json'))
    .then(() => true)
    .catch(() => false)
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
