import assert from 'node:assert/strict'
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {afterEach, beforeEach, describe, it} from 'node:test'
import {getEnvFiles, getEnvMode, readConfigEnv, withConfigEnv} from './env'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'vscode-sanity-env-'))
})

afterEach(() => {
  rmSync(dir, {recursive: true, force: true})
})

function write(file: string, content: string) {
  writeFileSync(path.join(dir, file), content)
}

describe('getEnvMode', () => {
  it('is development by default, like `sanity dev`', () => {
    assert.equal(getEnvMode({}), 'development')
  })

  it('is production when NODE_ENV is', () => {
    assert.equal(getEnvMode({NODE_ENV: 'production'}), 'production')
    assert.equal(getEnvMode({NODE_ENV: 'test'}), 'development')
  })

  it('lets SANITY_ACTIVE_ENV decide', () => {
    assert.equal(getEnvMode({SANITY_ACTIVE_ENV: 'staging', NODE_ENV: 'production'}), 'staging')
  })
})

describe('getEnvFiles', () => {
  it('lists the files in the order the Sanity CLI loads them', () => {
    assert.deepEqual(
      getEnvFiles('/studio', 'development').map((file) => path.basename(file)),
      ['.env', '.env.local', '.env.development', '.env.development.local']
    )
  })

  it('does not treat "local" as a mode', () => {
    assert.deepEqual(
      getEnvFiles('/studio', 'local').map((file) => path.basename(file)),
      ['.env', '.env.local']
    )
  })
})

describe('readConfigEnv', () => {
  it('reads .env', () => {
    write('.env', 'SANITY_STUDIO_PROJECT_ID=abc123\nSANITY_STUDIO_DATASET="production"\n')
    assert.deepEqual(readConfigEnv(dir, 'development', {}), {
      SANITY_STUDIO_PROJECT_ID: 'abc123',
      SANITY_STUDIO_DATASET: 'production',
    })
  })

  it('returns nothing without env files', () => {
    assert.deepEqual(readConfigEnv(dir, 'development', {}), {})
  })

  it('lets later files win: .env, .env.local, .env.<mode>, .env.<mode>.local', () => {
    write('.env', 'A=env\nB=env\nC=env\nD=env\n')
    write('.env.local', 'B=local\nC=local\nD=local\n')
    write('.env.development', 'C=development\nD=development\n')
    write('.env.development.local', 'D=development.local\n')
    write('.env.production', 'A=production\n')
    assert.deepEqual(readConfigEnv(dir, 'development', {}), {
      A: 'env',
      B: 'local',
      C: 'development',
      D: 'development.local',
    })
    assert.equal(readConfigEnv(dir, 'production', {}).A, 'production')
  })

  it('does not override variables that are already set', () => {
    write('.env', 'SANITY_STUDIO_DATASET=from-file\nSANITY_STUDIO_PROJECT_ID=from-file\n')
    assert.deepEqual(readConfigEnv(dir, 'development', {SANITY_STUDIO_DATASET: 'from-shell'}), {
      SANITY_STUDIO_PROJECT_ID: 'from-file',
    })
  })

  it('expands references', () => {
    write('.env', 'BASE=abc\nSANITY_STUDIO_PROJECT_ID=${BASE}123\nFROM_SHELL=$HOME_ID-x\n')
    assert.deepEqual(readConfigEnv(dir, 'development', {HOME_ID: 'shell'}), {
      BASE: 'abc',
      SANITY_STUDIO_PROJECT_ID: 'abc123',
      FROM_SHELL: 'shell-x',
    })
  })

  it('ignores a directory that is named like an env file', () => {
    mkdirSync(path.join(dir, '.env'))
    assert.deepEqual(readConfigEnv(dir, 'development', {}), {})
  })
})

describe('withConfigEnv', () => {
  it('exposes the variables to the callback and then removes them', () => {
    write('.env', 'SANITY_STUDIO_PROJECT_ID=abc123\n')
    const env: NodeJS.ProcessEnv = {KEEP: '1'}
    const seen = withConfigEnv(dir, () => ({...env}), env)
    assert.deepEqual(seen, {KEEP: '1', SANITY_STUDIO_PROJECT_ID: 'abc123'})
    assert.deepEqual(env, {KEEP: '1'})
  })

  it('removes them when the callback throws', () => {
    write('.env', 'SANITY_STUDIO_PROJECT_ID=abc123\n')
    const env: NodeJS.ProcessEnv = {}
    assert.throws(
      () =>
        withConfigEnv(
          dir,
          () => {
            throw new Error('boom')
          },
          env
        ),
      /boom/
    )
    assert.deepEqual(env, {})
  })

  it('uses SANITY_ACTIVE_ENV from the environment it is given', () => {
    write('.env.staging', 'SANITY_STUDIO_DATASET=staging\n')
    const env: NodeJS.ProcessEnv = {SANITY_ACTIVE_ENV: 'staging'}
    assert.equal(
      withConfigEnv(dir, () => env.SANITY_STUDIO_DATASET, env),
      'staging'
    )
  })

  it('reads process.env by default, which a config module sees', () => {
    write('.env', 'VSCODE_SANITY_TEST_PROJECT_ID=abc123\n')
    const configFile = path.join(dir, 'sanity.cli.js')
    writeFileSync(
      configFile,
      "module.exports = {default: {api: {projectId: process.env.VSCODE_SANITY_TEST_PROJECT_ID}}}\n"
    )
    withConfigEnv(dir, () => {
      // oxlint-disable-next-line @typescript-eslint/no-require-imports -- loading a config by path is the point
      const config: unknown = require(configFile)
      assert.deepEqual(config, {default: {api: {projectId: 'abc123'}}})
    })
    assert.equal(process.env.VSCODE_SANITY_TEST_PROJECT_ID, undefined)
  })
})
