import assert from 'node:assert'
import {mkdirSync, mkdtempSync, realpathSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import vscode from 'vscode'

const SOURCE = [
  "import slugPageQuery from '#queries/slugPage.groq'",
  "import missing from '#queries/missing.groq'",
  "import local from './local.groq'",
  "import present from 'lib/present.groq'",
  "import pkg from 'some-package/query.groq'",
  "import unmapped from '#other/query.groq'",
  '',
].join('\n')

describe('.groq imports', () => {
  let dir: string
  let doc: vscode.TextDocument

  before(async () => {
    dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'vscode-sanity-groq-import-')))
    mkdirSync(path.join(dir, 'src', 'queries'), {recursive: true})
    writeFileSync(
      path.join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {baseUrl: '.', paths: {'#queries/*': ['./src/queries/*']}},
      }),
    )
    writeFileSync(path.join(dir, 'src', 'queries', 'slugPage.groq'), '*[_type == "page"]')
    writeFileSync(path.join(dir, 'src', 'local.groq'), '*')
    mkdirSync(path.join(dir, 'lib'))
    writeFileSync(path.join(dir, 'lib', 'present.groq'), '*')
    const file = path.join(dir, 'src', 'page.ts')
    writeFileSync(file, SOURCE)
    doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file))
    await vscode.window.showTextDocument(doc)
  })

  async function definitionsAt(text: string) {
    const position = doc.positionAt(SOURCE.indexOf(text) + 1)
    return (
      (await vscode.commands.executeCommand<Array<vscode.Location>>(
        'vscode.executeDefinitionProvider',
        doc.uri,
        position,
      )) ?? []
    )
  }

  it('goes to the file a tsconfig paths alias points to', async () => {
    const locations = await definitionsAt('#queries/slugPage.groq')
    assert.ok(
      locations.some(
        (location) => location.uri.fsPath === path.join(dir, 'src/queries/slugPage.groq'),
      ),
      JSON.stringify(locations),
    )
  })

  it('goes to the file a relative import points to', async () => {
    const locations = await definitionsAt('./local.groq')
    assert.ok(
      locations.some((location) => location.uri.fsPath === path.join(dir, 'src/local.groq')),
      JSON.stringify(locations),
    )
  })

  it('still jumps to a file that exists under baseUrl', async () => {
    const locations = await definitionsAt('lib/present.groq')
    assert.ok(
      locations.some((location) => location.uri.fsPath === path.join(dir, 'lib/present.groq')),
      JSON.stringify(locations),
    )
  })

  it('does not define a missing package import or unmapped alias when baseUrl is set', async () => {
    for (const specifier of ['some-package/query.groq', '#other/query.groq']) {
      const locations = await definitionsAt(specifier)
      assert.deepStrictEqual(locations, [], specifier)
    }
  })

  it('does not define a mapped import whose file is missing', async () => {
    const locations = await definitionsAt('#queries/missing.groq')
    assert.deepStrictEqual(locations, [])
  })

  it('links the specifiers of files that exist', async () => {
    const links =
      (await vscode.commands.executeCommand<Array<vscode.DocumentLink>>(
        'vscode.executeLinkProvider',
        doc.uri,
      )) ?? []
    const targets = links.map((link) => link.target?.fsPath)
    assert.ok(
      targets.includes(path.join(dir, 'src/queries/slugPage.groq')),
      JSON.stringify(targets),
    )
    assert.ok(targets.includes(path.join(dir, 'src/local.groq')), JSON.stringify(targets))
    assert.ok(
      !targets.includes(path.join(dir, 'src/queries/missing.groq')),
      JSON.stringify(targets),
    )
  })
})
