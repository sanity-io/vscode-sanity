import assert from 'node:assert'
import {mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import vscode from 'vscode'

// https://github.com/sanity-io/vscode-sanity/issues/6
const NESTED_FILTER = `*[
  !(_id in path("drafts.**"))
  && _type == 'queryTest'
  && _id in *[
    _type == 'testRun' && instance._ref == $id
  ][].subject._ref
]`

// https://github.com/sanity-io/vscode-sanity/issues/23
const PIPE_IN_PROJECTION = `*[] {
  "key1": {
    "key2": arr[] | order(type)
  }
}`

interface SyntaxToken {
  /** Token text */
  c: string
  /** Space separated TextMate scopes */
  t: string
}

const dir = mkdtempSync(path.join(tmpdir(), 'vscode-sanity-grammar-'))

// Internal command VS Code's own colorization tests use. It tokenizes with every contributed
// grammar, injections included.
async function tokenize(name: string, source: string): Promise<Array<SyntaxToken>> {
  const file = path.join(dir, name)
  writeFileSync(file, source)
  const tokens = await vscode.commands.executeCommand<Array<SyntaxToken>>(
    '_workbench.captureSyntaxTokens',
    vscode.Uri.file(file),
  )
  assert.ok(tokens?.length, `no tokens for ${name}`)
  return tokens
}

function assertValid(tokens: Array<SyntaxToken>) {
  const invalid = tokens.filter((token) => token.t.includes('invalid'))
  assert.deepStrictEqual(invalid, [], 'valid GROQ was scoped as invalid')
}

function scopeOf(tokens: Array<SyntaxToken>, text: string) {
  const token = tokens.find((candidate) => candidate.c === text)
  assert.ok(token, `no token ${JSON.stringify(text)}`)
  return token.t
}

describe('GROQ grammar', () => {
  for (const [name, source] of [
    ['nested-filter', NESTED_FILTER],
    ['pipe-in-projection', PIPE_IN_PROJECTION],
  ]) {
    it(`does not flag ${name} in .groq files`, async () => {
      const tokens = await tokenize(`${name}.groq`, source)
      assertValid(tokens)
      assert.ok(tokens.every((token) => token.t.startsWith('source.groq')))
    })

    it(`does not flag ${name} in groq template literals`, async () => {
      const tokens = await tokenize(`${name}.ts`, `const query = groq\`${source}\`\n`)
      assertValid(tokens)
      assert.match(scopeOf(tokens, '*'), /meta\.embedded\.block\.groq/)
    })
  }

  it('scopes the pipe as an operator', async () => {
    const tokens = await tokenize('pipe.groq', PIPE_IN_PROJECTION)
    assert.match(scopeOf(tokens, '|'), /keyword\.operator\.pipe\.groq/)
    assert.match(scopeOf(tokens, 'order'), /support\.function\.groq/)
  })
})
