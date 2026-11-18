import assert from 'node:assert'
import {describe, it} from 'node:test'
import {findGroqSpecifiers} from './find-specifiers'

function specifiers(source: string) {
  return findGroqSpecifiers(source).map((found) => found.specifier)
}

describe('findGroqSpecifiers', () => {
  it('finds imports, re-exports, side effect imports, dynamic imports and require', () => {
    const source = [
      "import slugPageQuery from '#queries/slugPage.groq'",
      'import type {Query} from "./a.groq"',
      "export {default as b} from '../b.groq'",
      "import './side-effect.groq'",
      "const c = await import('./c.groq')",
      'const d = require("./d.groq")',
    ].join('\n')
    assert.deepStrictEqual(specifiers(source), [
      '#queries/slugPage.groq',
      './a.groq',
      '../b.groq',
      './side-effect.groq',
      './c.groq',
      './d.groq',
    ])
  })

  it('reports the range of the specifier without its quotes', () => {
    const source = "import q from '#queries/slugPage.groq'"
    const [found] = findGroqSpecifiers(source)
    assert.strictEqual(source.slice(found.start, found.end), '#queries/slugPage.groq')
  })

  it('ignores specifiers that are not .groq files and strings outside imports', () => {
    const source = [
      "import a from './a.ts'",
      "import b from './b.groqx'",
      "const c = './c.groq'",
      "// we don't import from 'x' or './d.groq'",
    ].join('\n')
    assert.deepStrictEqual(specifiers(source), [])
  })
})
