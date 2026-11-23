import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {describe, it} from 'node:test'
import {EMBEDDED_GROQ_LANGUAGES} from './languages'

interface Manifest {
  activationEvents: Array<string>
  contributes: {grammars: Array<{scopeName?: string; injectTo?: Array<string>}>}
}

function isManifest(value: unknown): value is Manifest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'activationEvents' in value &&
    'contributes' in value
  )
}

const parsedManifest: unknown = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
)
assert.ok(isManifest(parsedManifest), 'package.json is a manifest')
const manifest = parsedManifest

describe('EMBEDDED_GROQ_LANGUAGES', () => {
  it('has an activation event for every language', () => {
    for (const language of EMBEDDED_GROQ_LANGUAGES) {
      assert.ok(
        manifest.activationEvents.includes(`onLanguage:${language}`),
        `package.json is missing "onLanguage:${language}"`,
      )
    }
  })

  it('injects GROQ highlighting into Astro files', () => {
    const injection = manifest.contributes.grammars.find(
      (grammar) => grammar.scopeName === 'groq-injection.js',
    )
    assert.ok(injection?.injectTo?.includes('source.astro'))
  })
})
