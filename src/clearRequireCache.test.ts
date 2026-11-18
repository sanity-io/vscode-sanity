import assert from 'node:assert/strict'
import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs'
import {describe, it} from 'node:test'
import {tmpdir} from 'node:os'
import * as path from 'node:path'
import {clearRequireCache} from './clearRequireCache'

describe('clearRequireCache', () => {
  it('reloads a nested local import and leaves node_modules cached', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'vscode-sanity-cache-'))
    const helper = path.join(dir, 'helper.js')
    const pkgDir = path.join(dir, 'node_modules', 'left-alone')
    const pkg = path.join(pkgDir, 'index.js')
    const entry = path.join(dir, 'entry.js')
    mkdirSync(pkgDir, {recursive: true})
    writeFileSync(helper, 'exports.value = 1\n')
    writeFileSync(pkg, 'exports.value = 1\n')
    writeFileSync(
      entry,
      `exports.helper = require(${JSON.stringify(helper)}).value\n` +
        `exports.pkg = require(${JSON.stringify(pkg)}).value\n`
    )

    assert.deepEqual(require(entry), {helper: 1, pkg: 1})
    writeFileSync(helper, 'exports.value = 2\n')
    writeFileSync(pkg, 'exports.value = 2\n')

    clearRequireCache(require.resolve(entry))

    // The local helper is read again. The node_modules module is the copy still in require.cache.
    assert.deepEqual(require(entry), {helper: 2, pkg: 1})
  })
})
