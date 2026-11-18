import assert from 'node:assert'
import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import vscode from 'vscode'
import {GROQCodeLensProvider} from '../../providers/groq-codelens-provider'

const FRAGMENTS = `import {groq} from 'groq'

export const image = groq\`
  "image": image{
    ...,
    "asset": asset->,
  }
\`

export const fragment_pressPreview = /* groq */ \`
  "id": _id,
  title,
\`
`

const QUERY = `import {defineQuery, groq} from 'groq'
import {fragment_pressPreview, image} from './fragments'

const CONTACT_US_PAGE = groq\`
*[_id == 'contactUsPage'][0]{
  ...,
  \${image}
}\`

export const query_getArtist = defineQuery(\`
  *[_type == "artist" && slug.current == $slug][0] {
    press[]->{
      \${fragment_pressPreview}
    },
  }
\`)

export const unresolved = groq\`*[_type == "post"]{\${notAFragment}}\`
`

const EXPECTED = [
  `
*[_id == 'contactUsPage'][0]{
  ...,
  \n  "image": image{
    ...,
    "asset": asset->,
  }\n
}`,
  `
  *[_type == "artist" && slug.current == $slug][0] {
    press[]->{
      \n  "id": _id,
  title,\n
    },
  }
`,
  '*[_type == "post"]{${notAFragment}}',
]

function queriesOf(lenses: Array<vscode.CodeLens>, command = 'sanity.executeGroq') {
  return lenses.flatMap((lens) =>
    lens.command?.command === command ? [lens.command.arguments?.[0]] : [],
  )
}

describe('GROQ codelens', () => {
  it('executes and copies the query with the fragments interpolated into it', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'vscode-sanity-codelens-'))
    mkdirSync(path.join(dir, 'src'))
    writeFileSync(path.join(dir, 'src', 'fragments.ts'), FRAGMENTS)
    const file = path.join(dir, 'src', 'query.ts')
    writeFileSync(file, QUERY)

    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file))
    const deadline = Date.now() + 60_000
    let lenses: Array<vscode.CodeLens> = []
    // The extension activates when the document opens, so the provider may register a moment late.
    while (lenses.length < 3 && Date.now() < deadline) {
      lenses =
        (await vscode.commands.executeCommand<Array<vscode.CodeLens>>(
          'vscode.executeCodeLensProvider',
          document.uri,
        )) ?? []
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    for (const command of ['sanity.executeGroq', 'sanity.copyGroq']) {
      assert.deepStrictEqual(queriesOf(lenses, command), EXPECTED, command)
    }
  })

  it('refreshes Execute Query when an imported fragment is edited or saved', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'vscode-sanity-codelens-refresh-'))
    mkdirSync(path.join(dir, 'src'))
    const fragmentPath = path.join(dir, 'src', 'fragments.ts')
    const queryPath = path.join(dir, 'src', 'query.ts')
    writeFileSync(fragmentPath, 'export const image = groq`OLD`\n')
    writeFileSync(queryPath, "import {image} from './fragments'\ngroq`*{${image}}`\n")
    writeFileSync(path.join(dir, 'src', 'other.ts'), '')

    const provider = new GROQCodeLensProvider()
    const tokens = new vscode.CancellationTokenSource()
    try {
      const query = await vscode.workspace.openTextDocument(vscode.Uri.file(queryPath))
      const fragment = await vscode.workspace.openTextDocument(vscode.Uri.file(fragmentPath))
      const before = await provider.provideCodeLenses(query, tokens.token)
      assert.deepStrictEqual(queriesOf(before), ['*{OLD}'])

      const unrelated = await vscode.workspace.openTextDocument(
        vscode.Uri.file(path.join(dir, 'src', 'other.ts')),
      )
      let refreshes = 0
      const subscription = provider.onDidChangeCodeLenses(() => {
        refreshes++
      })
      const missed = new vscode.WorkspaceEdit()
      missed.insert(unrelated.uri, new vscode.Position(0, 0), 'const unused = 1\n')
      await vscode.workspace.applyEdit(missed)
      assert.strictEqual(refreshes, 0)

      const edited = new vscode.WorkspaceEdit()
      const start = fragment.getText().indexOf('OLD')
      edited.replace(
        fragment.uri,
        new vscode.Range(fragment.positionAt(start), fragment.positionAt(start + 3)),
        'NEW',
      )
      await vscode.workspace.applyEdit(edited)
      assert.strictEqual(refreshes, 1)

      const afterEdit = await provider.provideCodeLenses(query, tokens.token)
      assert.deepStrictEqual(queriesOf(afterEdit), ['*{NEW}'])

      await fragment.save()
      assert.strictEqual(refreshes, 2)
      subscription.dispose()
    } finally {
      tokens.dispose()
      provider.dispose()
    }
  })
})
