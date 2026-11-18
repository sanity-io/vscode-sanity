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

  it('drops local imports left cached when the entry throws', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'vscode-sanity-cache-'))
    const helper = path.join(dir, 'helper.js')
    const nested = path.join(dir, 'nested.js')
    const pkgDir = path.join(dir, 'node_modules', 'left-alone')
    const pkg = path.join(pkgDir, 'index.js')
    const entry = path.join(dir, 'entry.js')
    mkdirSync(pkgDir, {recursive: true})
    writeFileSync(nested, 'exports.value = 1\n')
    writeFileSync(helper, `exports.value = require(${JSON.stringify(nested)}).value\n`)
    writeFileSync(pkg, 'exports.value = 1\n')
    writeFileSync(
      entry,
      `require(${JSON.stringify(pkg)})\n` +
        `require(${JSON.stringify(helper)})\n` +
        'throw new Error("boom")\n'
    )

    assert.throws(() => require(entry), /boom/)
    assert.equal(require.cache[require.resolve(entry)], undefined)
    assert.ok(require.cache[require.resolve(helper)])
    assert.ok(require.cache[require.resolve(nested)])
    assert.ok(require.cache[require.resolve(pkg)])

    clearRequireCache(require.resolve(entry))

    assert.equal(require.cache[require.resolve(helper)], undefined)
    assert.equal(require.cache[require.resolve(nested)], undefined)
    assert.ok(require.cache[require.resolve(pkg)])

    writeFileSync(nested, 'exports.value = 2\n')
    writeFileSync(entry, `exports.value = require(${JSON.stringify(helper)}).value\n`)
    assert.equal(require(entry).value, 2)
  })
})
