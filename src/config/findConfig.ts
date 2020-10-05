import * as path from 'path'
import {promises as fs} from 'fs'

export async function loadConfig(basePath: string) {
  let dir = basePath
  while (!(await hasConfig(dir))) {
    const parent = path.dirname(dir)
    if (!dir || parent === dir) {
      return false
    }

    dir = parent
  }

  const configContent = await fs.readFile(path.join(dir, 'sanity.json'), 'utf8')
  const config = parseJson(configContent)
  if (!config || !config.api || !config.api.projectId) {
    return false
  }

  return config.api
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
