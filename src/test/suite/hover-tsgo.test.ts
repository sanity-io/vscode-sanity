import * as assert from 'assert'
import {readFileSync} from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import {TRUNCATED_NOTICE} from '../../providers/groq-hover-provider'

const project = process.env.SANITY_TEST_TSGO

function markdownOf(hovers: vscode.Hover[]): string[] {
  return hovers.flatMap((hover) =>
    hover.contents.map((content) => (typeof content === 'string' ? content : content.value))
  )
}

/** Hovers `identifier` in usage.ts until the TypeScript 7 hover is up and ours has answered. */
async function hoverOn(identifier: string): Promise<string[]> {
  const uri = vscode.Uri.file(path.join(project!, 'src', 'usage.ts'))
  const doc = await vscode.workspace.openTextDocument(uri)
  await vscode.window.showTextDocument(doc)
  const position = doc.positionAt(doc.getText().lastIndexOf(identifier) + 1)

  const deadline = Date.now() + 150_000
  for (;;) {
    const hovers =
      (await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        uri,
        position
      )) ?? []
    const md = markdownOf(hovers)
    const tsHover = md.find((part) => part.includes('const query'))
    const ours = md.find((part) => part.includes('```groq') || part === TRUNCATED_NOTICE)
    if ((tsHover && ours) || Date.now() > deadline) return md
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}

describe('GROQ in TypeScript 7.1 hovers (tsgo + groq-content-mapper)', function () {
  this.timeout(200_000)

  before(function () {
    if (!project) this.skip()
  })

  it('runs against TypeScript 7.1 through the TypeScript 7 extension', async () => {
    const tsdk = path.resolve(__dirname, '../../../node_modules/typescript-7/package.json')
    assert.match(JSON.parse(readFileSync(tsdk, 'utf8')).version, /^7\.1\./)
    const nativePreview = vscode.extensions.getExtension('TypeScriptTeam.native-preview')
    assert.ok(nativePreview, 'TypeScriptTeam.native-preview is not installed')
    await nativePreview.activate()
    assert.ok(nativePreview.isActive)
  })

  it('formats a query with prepended custom functions, comments and slice params', async () => {
    const md = await hoverOn('longQuery')

    const tsHover = md.find((part) => part.includes('const query'))
    assert.ok(tsHover, JSON.stringify(md))
    assert.ok(
      tsHover.includes('__groqResult') || tsHover.includes('& ...'),
      'expected the mapper type'
    )
    assert.ok(
      tsHover.includes('\\n'),
      'expected tsgo to print the query as an escaped one line string'
    )

    const block = md.find((part) => part.startsWith('```groq\n'))
    assert.ok(block, JSON.stringify(md))
    const lines = block.split('\n')
    assert.ok(lines.length > 15, 'expected the query on real lines')
    assert.ok(!block.includes('\\n'), 'line breaks must not be the two characters \\n')

    assert.deepStrictEqual(lines.slice(1, 3), [
      'fn image::asset($asset) = $asset-> { url, metadata };',
      'fn image::field($image) = $image { crop, hotspot, "asset": image::asset(asset) };',
    ])
    assert.ok(
      lines.includes('// All published posts with their author, categories and related posts')
    )
    assert.ok(
      lines.includes(
        '*[_type == "post" && defined(slug.current) && publishedAt < now()] | order(publishedAt desc)[$start...$end] {'
      ) || lines.some((line) => line.startsWith('*[_type == "post"')),
      block
    )
    assert.ok(lines.includes('  _id,'), block)
  })

  it('formats a short query', async () => {
    const md = await hoverOn('shortQuery')
    assert.ok(
      md.includes('```groq\n*[_type == "post"][0] {\n  _id,\n  title\n}\n```'),
      JSON.stringify(md)
    )
  })

  it('says so when tsgo truncates the hover, instead of formatting half a query', async () => {
    const md = await hoverOn('huge')

    const tsHover = md.find((part) => part.includes('const query'))
    assert.ok(tsHover, JSON.stringify(md))
    assert.ok(/\.\.\.\s*```\s*$/.test(tsHover), 'expected tsgo to cut the hover off with "..."')
    assert.ok(!tsHover.includes('}" &'), 'expected the string literal to be left open')

    assert.ok(md.includes(TRUNCATED_NOTICE), JSON.stringify(md.map((part) => part.slice(0, 80))))
    assert.ok(!md.some((part) => part.includes('```groq')))
  })
})
