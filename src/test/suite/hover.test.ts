import * as assert from 'assert'
import {mkdtempSync, writeFileSync} from 'fs'
import {tmpdir} from 'os'
import * as path from 'path'
import * as vscode from 'vscode'

const FORMATTED = [
  '*[_type == "post" && defined(slug.current)] {',
  '  _id,',
  '  title,',
  '  "author": author->name,',
  '  "cats": categories[]-> { title }',
  '}',
  '  | order(_createdAt desc)[0...10]',
].join('\n')

// What groq-content-mapper emits for a `.groq` import, minified.
const SOURCE = `export type Query = /* groq */ \`*[_type == "post" && defined(slug.current)]{_id,title,"author":author->name,"cats":categories[]->{title}} | order(_createdAt desc)[0...10]\`
export type Plain = "hello world"
declare const query: Query
export const used = query
`

function markdownOf(hovers: vscode.Hover[]): string[] {
  return hovers.flatMap((hover) =>
    hover.contents.map((content) =>
      typeof content === 'string' ? content : 'language' in content ? content.value : content.value
    )
  )
}

async function hoversAt(
  uri: vscode.Uri,
  position: vscode.Position,
  until: (md: string[]) => boolean
) {
  const deadline = Date.now() + 90_000
  for (;;) {
    const hovers =
      (await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        uri,
        position
      )) ?? []
    const md = markdownOf(hovers)
    if (until(md) || Date.now() > deadline) return md
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}

describe('GROQ in TypeScript hovers', () => {
  let uri: vscode.Uri
  let doc: vscode.TextDocument

  before(async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'vscode-sanity-hover-'))
    writeFileSync(path.join(dir, 'tsconfig.json'), '{"compilerOptions":{"strict":true}}')
    const file = path.join(dir, 'query.ts')
    writeFileSync(file, SOURCE)
    uri = vscode.Uri.file(file)
    doc = await vscode.workspace.openTextDocument(uri)
    await vscode.window.showTextDocument(doc)
  })

  it('shows a formatted, highlighted copy next to the one line TypeScript hover', async () => {
    const position = doc.positionAt(SOURCE.indexOf('Query') + 1)
    const md = await hoversAt(
      uri,
      position,
      (parts) =>
        parts.some((part) => part.includes('```groq')) &&
        parts.some((part) => part.includes('type Query'))
    )

    const tsHover = md.find((part) => part.includes('type Query'))
    assert.ok(tsHover, `TypeScript hover missing: ${JSON.stringify(md)}`)
    assert.ok(
      tsHover.includes('\\n') || !tsHover.includes('\n*['),
      'expected TypeScript to print an escaped one line string'
    )

    const groqHover = md.find((part) => part.includes('```groq'))
    assert.ok(groqHover, `GROQ hover missing: ${JSON.stringify(md)}`)
    assert.strictEqual(groqHover, '```groq\n' + FORMATTED + '\n```')
  })

  it('also formats when hovering a value of that type', async () => {
    const position = doc.positionAt(SOURCE.indexOf('const query') + 'const '.length + 1)
    const md = await hoversAt(uri, position, (parts) =>
      parts.some((part) => part.includes('```groq'))
    )
    assert.ok(
      md.some((part) => part.includes('```groq\n' + FORMATTED)),
      JSON.stringify(md)
    )
  })

  it('adds nothing for strings that are not GROQ', async () => {
    const position = doc.positionAt(SOURCE.indexOf('Plain') + 1)
    const md = await hoversAt(uri, position, (parts) =>
      parts.some((part) => part.includes('type Plain'))
    )
    assert.ok(md.some((part) => part.includes('type Plain')))
    assert.ok(!md.some((part) => part.includes('```groq')), JSON.stringify(md))
  })

  it('can be turned off', async () => {
    const config = vscode.workspace.getConfiguration('sanity')
    await config.update('formatGroqInHover', false, vscode.ConfigurationTarget.Global)
    try {
      const position = doc.positionAt(SOURCE.indexOf('Query') + 1)
      const md = await hoversAt(uri, position, (parts) =>
        parts.some((part) => part.includes('type Query'))
      )
      assert.ok(md.some((part) => part.includes('type Query')))
      assert.ok(!md.some((part) => part.includes('```groq')))
    } finally {
      await config.update('formatGroqInHover', undefined, vscode.ConfigurationTarget.Global)
    }
  })
})
