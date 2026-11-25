import assert from 'node:assert'
import {mkdirSync, mkdtempSync, symlinkSync, writeFileSync} from 'node:fs'
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
  return lenses.flatMap((lens): Array<unknown> => {
    if (lens.command?.command !== command) {
      return []
    }
    const args: Array<unknown> = lens.command.arguments ?? []
    return [args[0]]
  })
}

const IMAGE_FUNCTIONS = `// Image helpers
// shared by the page queries
fn image::asset($asset) = $asset->{url, metadata{lqip, dimensions}};
fn image::field($image) = $image{crop, hotspot, "asset": image::asset(asset)};
fn image::richText($blocks) = $blocks[]{
  ...,
  _type == "image" => {_key, _type, alt, caption, crop, hotspot, "asset": image::asset(asset)},
  _type == "timeline" => {
    ...,
    items[]{..., milestones[]{..., "image": image::field(image)}}
  }
};
`

const SLUG_PAGE = `*[_type == "page" && slug.current == $slug][0] {
  _id,
  "body": image::richText(body),
  title
}
`

/** A project whose tsconfig.json shares groq/image.groq through groq-content-mapper. */
function functionsProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'vscode-sanity-codelens-functions-'))
  mkdirSync(path.join(dir, 'groq'))
  mkdirSync(path.join(dir, 'queries'))
  writeFileSync(
    path.join(dir, 'tsconfig.json'),
    JSON.stringify({
      contentMappers: [
        {
          package: '@sanity-labs/groq-content-mapper',
          extensions: ['.groq'],
          options: {functions: ['groq/*.groq']},
        },
      ],
    }),
  )
  writeFileSync(path.join(dir, 'groq', 'image.groq'), IMAGE_FUNCTIONS)
  writeFileSync(path.join(dir, 'queries', 'slugPage.groq'), SLUG_PAGE)
  return dir
}

describe('GROQ codelens', () => {
  it('shows Format Query and Find References, not Execute or Copy, on a file of only functions', async () => {
    const file = path.join(functionsProject(), 'groq', 'image.groq')
    const provider = new GROQCodeLensProvider()
    const tokens = new vscode.CancellationTokenSource()
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file))
      const lenses = await provider.provideCodeLenses(document, tokens.token)
      assert.deepStrictEqual(
        lenses.map((lens) => [lens.command?.title, lens.range.start.line]),
        [
          ['Format Query', 0],
          ['Find References', 2],
          ['Find References', 3],
          ['Find References', 4],
        ],
      )
      const [, asset] = lenses
      assert.strictEqual(asset.command?.command, 'editor.action.findReferences')
      assert.deepStrictEqual(asset.command?.arguments?.[1], new vscode.Position(2, 3))

      const [format] = lenses
      await vscode.commands.executeCommand(
        format.command!.command,
        ...(format.command!.arguments ?? []),
      )
      assert.match(
        document.getText(),
        /^\/\/ Image helpers\n\/\/ shared by the page queries\nfn image::asset\(\$asset\) = \$asset->\{ url, metadata \{ lqip, dimensions \} \};\n/,
      )
      assert.ok(document.getText().endsWith('};\n'), document.getText())
    } finally {
      tokens.dispose()
      provider.dispose()
    }
  })

  it('prepends a functions file added after the lenses were built once a .groq file is saved', async () => {
    const dir = functionsProject()
    const file = path.join(dir, 'queries', 'card.groq')
    const query = '*[_type == "card"]{"author": author::name(author)}\n'
    writeFileSync(file, query)
    const provider = new GROQCodeLensProvider()
    const tokens = new vscode.CancellationTokenSource()
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file))
      const before = await provider.provideCodeLenses(document, tokens.token)
      assert.deepStrictEqual(queriesOf(before), [query])

      const definition = 'fn author::name($author) = $author->{name};'
      writeFileSync(path.join(dir, 'groq', 'author.groq'), `${definition}\n`)
      let refreshes = 0
      const subscription = provider.onDidChangeCodeLenses(() => {
        refreshes++
      })
      const edit = new vscode.WorkspaceEdit()
      edit.insert(document.uri, new vscode.Position(1, 0), '\n')
      await vscode.workspace.applyEdit(edit)
      await document.save()
      subscription.dispose()
      assert.ok(refreshes > 0)

      const after = await provider.provideCodeLenses(document, tokens.token)
      assert.deepStrictEqual(queriesOf(after), [`${definition}\n${query}\n`])
    } finally {
      tokens.dispose()
      provider.dispose()
    }
  })

  it('executes and copies a query with the custom functions it calls prepended', async () => {
    const file = path.join(functionsProject(), 'queries', 'slugPage.groq')
    const provider = new GROQCodeLensProvider()
    const tokens = new vscode.CancellationTokenSource()
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file))
      const lenses = await provider.provideCodeLenses(document, tokens.token)
      const definitions = IMAGE_FUNCTIONS.slice(IMAGE_FUNCTIONS.indexOf('fn ')).trimEnd()
      for (const command of ['sanity.executeGroq', 'sanity.copyGroq']) {
        assert.deepStrictEqual(
          queriesOf(lenses, command),
          [`${definitions}\n${SLUG_PAGE}`],
          command,
        )
      }

      await vscode.env.clipboard.writeText('')
      await vscode.window.showTextDocument(document)
      await vscode.commands.executeCommand('sanity.copyGroq')
      assert.strictEqual(await vscode.env.clipboard.readText(), `${definitions}\n${SLUG_PAGE}`)
    } finally {
      tokens.dispose()
      provider.dispose()
    }
  })

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
      await new Promise((resolve) => {
        setTimeout(resolve, 500)
      })
    }

    for (const command of ['sanity.executeGroq', 'sanity.copyGroq']) {
      assert.deepStrictEqual(queriesOf(lenses, command), EXPECTED, command)
    }
  })

  it('resolves fragments imported from a workspace package', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'vscode-sanity-codelens-workspace-'))
    const pkg = path.join(dir, 'packages', 'queries')
    mkdirSync(path.join(pkg, 'src'), {recursive: true})
    writeFileSync(
      path.join(pkg, 'package.json'),
      JSON.stringify({name: '@repo/queries', exports: {'.': {source: './src/index.ts'}}}),
    )
    writeFileSync(
      path.join(pkg, 'src', 'index.ts'),
      'export const author = defineQuery(`{ name }`)\n',
    )
    mkdirSync(path.join(dir, 'apps', 'web', 'node_modules', '@repo'), {recursive: true})
    symlinkSync(pkg, path.join(dir, 'apps', 'web', 'node_modules', '@repo', 'queries'), 'dir')
    const file = path.join(dir, 'apps', 'web', 'query.ts')
    writeFileSync(
      file,
      "import {author} from '@repo/queries'\ndefineQuery(`*[_type == \"article\"]{ author->${author} }`)\n",
    )

    const provider = new GROQCodeLensProvider()
    const tokens = new vscode.CancellationTokenSource()
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file))
      const lenses = await provider.provideCodeLenses(document, tokens.token)
      assert.deepStrictEqual(queriesOf(lenses), ['*[_type == "article"]{ author->{ name } }'])
    } finally {
      tokens.dispose()
      provider.dispose()
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
