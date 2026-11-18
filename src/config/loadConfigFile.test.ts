import assert from 'node:assert/strict'
import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs'
import {describe, it} from 'node:test'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {loadConfigFile} from './loadConfigFile'

// Sanity v3 ships `sanity/cli` as minified CommonJS with getter exports, which Node's ES module loader
// cannot see as named exports.
const SANITY_CLI_CJS = `"use strict";
Object.defineProperty(exports, "__esModule", { value: !0 });
const cli = { defineCliConfig: (config) => config };
Object.defineProperty(exports, "defineCliConfig", {
  enumerable: !0,
  get: function() {
    return cli.defineCliConfig;
  }
});
`

const SANITY_CLI_TS = `import {defineCliConfig} from 'sanity/cli'

const projectId: string = 'abc123'
export default defineCliConfig({api: {projectId, dataset: 'production'}})
`

const SANITY_CLI_TS_WITH_LOCAL_IMPORT = `import {defineCliConfig} from 'sanity/cli'
import {dataset} from './env'

const projectId: string = 'abc123'
export default defineCliConfig({api: {projectId, dataset}})
`

interface PackageJson {
  name: string
  private: boolean
  type?: 'module'
}

function createProject(packageJson: PackageJson, sanityCliTs = SANITY_CLI_TS) {
  const dir = mkdtempSync(path.join(tmpdir(), 'vscode-sanity-config-'))
  const sanityDir = path.join(dir, 'node_modules', 'sanity')
  mkdirSync(path.join(sanityDir, 'lib'), {recursive: true})
  writeFileSync(
    path.join(sanityDir, 'package.json'),
    JSON.stringify({
      name: 'sanity',
      exports: {'./cli': {require: './lib/cli.js', default: './lib/cli.js'}},
    }),
  )
  writeFileSync(path.join(sanityDir, 'lib', 'cli.js'), SANITY_CLI_CJS)
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify(packageJson))
  writeFileSync(path.join(dir, 'env.ts'), "export const dataset: string = 'production'\n")
  writeFileSync(path.join(dir, 'sanity.cli.ts'), sanityCliTs)
  return path.join(dir, 'sanity.cli.ts')
}

const EXPECTED = {api: {projectId: 'abc123', dataset: 'production'}}

describe('loadConfigFile', () => {
  for (const [name, packageJson] of [
    ['a CommonJS project', {name: 'studio', private: true}],
    ['a "type": "module" project', {name: 'studio', private: true, type: 'module'}],
  ] as const) {
    it(`loads sanity.cli.ts importing a CommonJS sanity/cli in ${name}, every time`, async () => {
      const configFile = createProject(packageJson)
      // A failed load used to break every later attempt, so both attempts are checked.
      const first = await loadConfigFile(configFile).catch((error: unknown) => error)
      const second = await loadConfigFile(configFile).catch((error: unknown) => error)
      assert.deepEqual([first, second], [EXPECTED, EXPECTED])
    })

    it(`loads sanity.cli.ts importing a local .ts file without an extension in ${name}`, async () => {
      const configFile = createProject(packageJson, SANITY_CLI_TS_WITH_LOCAL_IMPORT)
      assert.deepEqual(await loadConfigFile(configFile), EXPECTED)
    })
  }

  it('restores the .ts loader it replaced', async () => {
    const before = require.extensions['.ts']
    await loadConfigFile(createProject({name: 'studio', private: true}))
    assert.equal(require.extensions['.ts'], before)
  })
})
