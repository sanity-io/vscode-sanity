import assert from 'node:assert'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import vscode from 'vscode'
import {TRUNCATED_NOTICE} from '../../providers/groq-hover-provider'

const project = process.env.SANITY_TEST_TSGO

// groq-format at 80 columns, run over the whole string the mapper produces: the prepended custom
// functions, the leading comment and the query.
const LONG_QUERY_FORMATTED = [
  'fn image::asset($asset) = $asset-> { url, metadata };',
  'fn image::field($image) = $image { crop, hotspot, "asset": image::asset(asset) };',
  '',
  '// All published posts with their author, categories and related posts',
  '*[_type == "post" && defined(slug.current) && publishedAt < now()]',
  '  | order(publishedAt desc)[$start...$end] {',
  '  _id,',
  '  title,',
  '  slug,',
  '  "image": image::field(mainImage),',
  '  "author": author-> { name, "avatar": image::field(avatar) },',
  '  "categories": categories[]-> { title, "slug": slug.current },',
  '  "related": *[_type == "post" && _id != ^._id',
  '    && count(categories[@._ref in ^.^.categories[]._ref]) > 0][0...3] {',
  '    _id,',
  '    title,',
  '    "image": image::field(mainImage)',
  '  }',
  '}',
].join('\n')

function markdownOf(hovers: Array<vscode.Hover>): Array<string> {
  return hovers.flatMap((hover) =>
    hover.contents.map((content) => (typeof content === 'string' ? content : content.value))
  )
}

/** Hovers `identifier` in usage.ts until the TypeScript 7 hover is up and ours has answered. */
async function hoverOn(identifier: string): Promise<Array<string>> {
  const uri = vscode.Uri.file(path.join(project!, 'src', 'usage.ts'))
  const doc = await vscode.workspace.openTextDocument(uri)
  await vscode.window.showTextDocument(doc)
  const position = doc.positionAt(doc.getText().lastIndexOf(identifier) + 1)

  const deadline = Date.now() + 150_000
  for (;;) {
    const hovers =
      (await vscode.commands.executeCommand<Array<vscode.Hover>>(
        'vscode.executeHoverProvider',
        uri,
        position
      )) ?? []
    const md = markdownOf(hovers)
    const tsHover = md.find((part) => part.includes('const query'))
    const ours = md.find((part) => part.startsWith('```groq') || part === TRUNCATED_NOTICE)
    if ((tsHover && ours) || Date.now() > deadline) {return md}
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}

describe('GROQ in TypeScript 7.1 hovers (tsgo + groq-content-mapper)', function () {
  this.timeout(200_000)

  before(async function () {
    if (!project) {this.skip()}
    await vscode.workspace
      .getConfiguration('sanity')
      .update('formatGroqInHoverWidth', 80, vscode.ConfigurationTarget.Global)
  })

  after(async () => {
    await vscode.workspace
      .getConfiguration('sanity')
      .update('formatGroqInHoverWidth', undefined, vscode.ConfigurationTarget.Global)
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
      tsHover.includes(String.raw`\n`),
      'expected tsgo to print the query as an escaped one line string'
    )

    const block = md.find((part) => part.startsWith('```groq\n'))
    assert.ok(block, JSON.stringify(md))
    assert.strictEqual(block, '```groq\n' + LONG_QUERY_FORMATTED + '\n```')
  })

  it('formats a short query', async () => {
    const md = await hoverOn('shortQuery')
    assert.ok(md.includes('```groq\n*[_type == "post"][0] { _id, title }\n```'), JSON.stringify(md))
  })

  it("formats the mapper's doc block when tsgo truncates the type", async () => {
    const md = await hoverOn('huge')

    const tsHover = md.find((part) => part.includes('const query'))
    assert.ok(tsHover, JSON.stringify(md))
    assert.match(
      tsHover,
      /^```typescript\n\(alias\) const query: "[^\n]*\.\.\.\n```/,
      'expected tsgo to cut the type off with "..." and leave the literal open'
    )

    assert.ok(!md.includes(TRUNCATED_NOTICE), 'the doc block holds the whole query')
    const block = md.find((part) => part.startsWith('```groq\n'))
    assert.ok(block, JSON.stringify(md.map((part) => part.slice(0, 80))))
    const lines = block.split('\n').slice(1, -1)
    assert.deepStrictEqual(lines.slice(0, 3), [
      '*[_type == "post" && defined(slug.current)] | order(publishedAt desc)[$start...$end] {',
      '  _id,',
      '  "field0": coalesce(title, "fallback value number 0"),',
    ])
    assert.strictEqual(lines.length, 113)
    assert.strictEqual(lines.at(-1), '}')
  })
})
