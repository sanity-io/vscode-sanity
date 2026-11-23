import assert from 'node:assert'
import {mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import vscode from 'vscode'

const QUERY = '*[_type == "post"]{title}'
const SOURCE = `import {defineQuery} from 'groq'
export const query = defineQuery('${QUERY}')
`

async function openFile(name: string, content: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'vscode-sanity-copy-'))
  const file = path.join(dir, name)
  writeFileSync(file, content)
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file))
  const editor = await vscode.window.showTextDocument(doc)
  return {doc, editor}
}

async function codeLensesOf(uri: vscode.Uri): Promise<Array<vscode.CodeLens>> {
  const deadline = Date.now() + 30_000
  for (;;) {
    const lenses =
      (await vscode.commands.executeCommand<Array<vscode.CodeLens>>(
        'vscode.executeCodeLensProvider',
        uri,
      )) ?? []
    if (lenses.length > 0 || Date.now() > deadline) {
      return lenses
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 500)
    })
  }
}

describe('Copy GROQ query', () => {
  beforeEach(() => vscode.env.clipboard.writeText(''))

  it('adds a Copy Query CodeLens next to Execute Query that copies the query', async () => {
    const {doc} = await openFile('query.ts', SOURCE)
    const lenses = await codeLensesOf(doc.uri)
    assert.deepStrictEqual(
      lenses.map((lens) => lens.command?.title),
      ['Execute Query', 'Copy Query'],
    )

    const copy = lenses[1].command!
    assert.strictEqual(copy.command, 'sanity.copyGroq')
    assert.deepStrictEqual(copy.arguments, [QUERY])
    await vscode.commands.executeCommand(copy.command, ...(copy.arguments ?? []))
    assert.strictEqual(await vscode.env.clipboard.readText(), QUERY)
  })

  it('copies the whole .groq file when nothing is selected', async () => {
    await openFile('query.groq', QUERY)
    await vscode.commands.executeCommand('sanity.copyGroq')
    assert.strictEqual(await vscode.env.clipboard.readText(), QUERY)
  })

  it('copies only the selection', async () => {
    const {editor} = await openFile('query.groq', QUERY)
    editor.selection = new vscode.Selection(0, 0, 0, '*[_type == "post"]'.length)
    await vscode.commands.executeCommand('sanity.copyGroq')
    assert.strictEqual(await vscode.env.clipboard.readText(), '*[_type == "post"]')
  })
})
