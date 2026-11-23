import {strict as assert} from 'node:assert'
import path from 'node:path'
import {describe, it} from 'node:test'
import type {WorkspaceConfiguration} from 'vscode'
import {readServerSettings} from './settings'

interface Values {
  schemaPath?: string
  maxDiagnostics?: number
  enableFormatting?: boolean
}

function config(values: Values): Pick<WorkspaceConfiguration, 'get'> {
  return {
    get: <T>(key: string, fallback?: T) =>
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a test double for the generic `get`
      key in values ? (values[key as keyof Values] as T) : fallback,
  }
}

const root = path.resolve('/workspace')

void describe('readServerSettings', () => {
  void it('uses the defaults and leaves the schema to auto-detection', () => {
    assert.deepEqual(readServerSettings(config({}), root), {
      schemaPath: undefined,
      maxDiagnostics: 100,
      enableFormatting: true,
    })
  })

  void it('resolves a relative schema path against the workspace folder', () => {
    const settings = readServerSettings(config({schemaPath: 'studio/schema.json'}), root)
    assert.equal(settings.schemaPath, path.join(root, 'studio', 'schema.json'))
  })

  void it('keeps an absolute schema path', () => {
    const schemaPath = path.resolve('/elsewhere/schema.json')
    assert.equal(readServerSettings(config({schemaPath}), root).schemaPath, schemaPath)
  })

  void it('passes maxDiagnostics and enableFormatting through', () => {
    const settings = readServerSettings(config({maxDiagnostics: 3, enableFormatting: false}), root)
    assert.equal(settings.maxDiagnostics, 3)
    assert.equal(settings.enableFormatting, false)
  })
})
