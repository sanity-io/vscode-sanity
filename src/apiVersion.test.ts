import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {describe, it} from 'node:test'
import {DEFAULT_API_VERSION, resolveApiVersion} from './apiVersion'

describe('resolveApiVersion', () => {
  it('uses the default when the setting is empty', () => {
    for (const value of [undefined, null, '']) {
      assert.deepEqual(resolveApiVersion(value), {apiVersion: DEFAULT_API_VERSION})
    }
  })

  it('accepts dated versions with or without the v prefix', () => {
    assert.deepEqual(resolveApiVersion('v2021-03-25'), {apiVersion: 'v2021-03-25'})
    assert.deepEqual(resolveApiVersion('2024-12-31'), {apiVersion: '2024-12-31'})
  })

  it('accepts the legacy v1 and the experimental vX versions', () => {
    for (const value of ['v1', '1', 'vX', 'X']) {
      assert.deepEqual(resolveApiVersion(value), {apiVersion: value})
    }
  })

  it('trims surrounding whitespace', () => {
    assert.deepEqual(resolveApiVersion('  v2021-03-25 '), {apiVersion: 'v2021-03-25'})
  })

  it('falls back to the default and reports an unusable value', () => {
    for (const value of [
      'latest',
      'v2021-3-25',
      'v2021-13-01',
      'v2021-00-10',
      '2021-01-32',
      'v2',
      42,
      {},
    ]) {
      assert.deepEqual(resolveApiVersion(value), {
        apiVersion: DEFAULT_API_VERSION,
        invalid: String(value),
      })
    }
  })
})

describe('sanity.apiVersion in package.json', () => {
  const manifest = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))
  const setting = manifest.contributes.configuration.properties['sanity.apiVersion']

  it('defaults to the version the extension falls back to', () => {
    assert.equal(setting.default, DEFAULT_API_VERSION)
  })

  it('has a pattern that agrees with the runtime validation', () => {
    const pattern = new RegExp(setting.pattern)
    const values = [
      'v2025-02-19',
      '2021-03-25',
      'v1',
      '1',
      'vX',
      'X',
      'latest',
      'v2021-3-25',
      'v2021-13-01',
      '2021-01-32',
      'v2',
    ]
    for (const value of values) {
      assert.equal(pattern.test(value), resolveApiVersion(value).invalid === undefined, value)
    }
  })
})
