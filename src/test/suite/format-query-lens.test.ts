import {strict as assert} from 'node:assert'
import {mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {
  commands,
  ConfigurationTarget,
  extensions,
  window,
  workspace,
  type CodeLens,
  type TextDocument,
} from 'vscode'

const TS = [
  "import groq from 'groq'",
  "import {defineQuery} from 'groq'",
  '',
  'export const posts = groq`*[_type == "post"]{  title,body}`',
  'export const authors = defineQuery(`*[_type == "author"]{name,"n": count(*[references(^._id)])}`)',
  'export const quoted = defineQuery("*[_type == \'tag\']{  title}")',
  'export const dynamic = groq`*[_type == "${type}"]{  title}`',
  '',
].join('\n')

async function formatLenses(doc: TextDocument): Promise<Array<CodeLens>> {
  const lenses = await commands.executeCommand<Array<CodeLens>>(
    'vscode.executeCodeLensProvider',
    doc.uri,
  )
  return lenses.filter((lens) => lens.command?.command === 'sanity.formatQuery')
}

async function run(lens: CodeLens) {
  assert.ok(lens.command)
  await commands.executeCommand(lens.command.command, ...(lens.command.arguments ?? []))
}

describe('"Format Query" code lens', () => {
  let dir: string

  before(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'vscode-sanity-format-lens-'))
    await extensions.getExtension('sanity-io.vscode-sanity')?.activate()
  })

  it('formats one query in a TypeScript file and leaves the rest alone', async () => {
    writeFileSync(path.join(dir, 'lens.ts'), TS)
    const doc = await workspace.openTextDocument(path.join(dir, 'lens.ts'))
    await window.showTextDocument(doc)

    const lenses = await formatLenses(doc)
    assert.deepEqual(
      lenses.map((lens) => lens.range.start.line),
      [3, 4],
      'one lens per template literal query, none for quoted strings or interpolations',
    )

    await run(lenses[1])
    assert.equal(
      doc.getText(),
      TS.replace(
        '`*[_type == "author"]{name,"n": count(*[references(^._id)])}`',
        '`*[_type == "author"] { name, "n": count(*[references(^._id)]) }`',
      ),
    )

    const [posts] = await formatLenses(doc)
    await run(posts)
    assert.equal(
      doc.lineAt(3).text,
      'export const posts = groq`*[_type == "post"] { title, body }`',
    )
    assert.equal(
      doc.lineAt(4).text,
      'export const authors = defineQuery(`*[_type == "author"] { name, "n": count(*[references(^._id)]) }`)',
    )
  })

  it('formats a .groq file and keeps its final newline', async () => {
    writeFileSync(path.join(dir, 'lens.groq'), '*[_type == "post"]{  title,body}\n')
    const doc = await workspace.openTextDocument(path.join(dir, 'lens.groq'))
    await window.showTextDocument(doc)

    const [lens] = await formatLenses(doc)
    await run(lens)
    assert.equal(doc.getText(), '*[_type == "post"] { title, body }\n')
  })

  it('does not touch a query that changed after the lens was computed', async () => {
    writeFileSync(path.join(dir, 'stale.ts'), 'const q = groq`*[_type == "a"]{  x}`\n')
    const doc = await workspace.openTextDocument(path.join(dir, 'stale.ts'))
    const editor = await window.showTextDocument(doc)

    const [lens] = await formatLenses(doc)
    await editor.edit((edit) => edit.insert(doc.positionAt(0), '// moved\n'))
    await run(lens)
    assert.equal(doc.getText(), '// moved\nconst q = groq`*[_type == "a"]{  x}`\n')
  })

  it('is hidden when groq.enableFormatting is off', async () => {
    writeFileSync(path.join(dir, 'off.ts'), 'const q = groq`*[_type == "a"]{  x}`\n')
    const doc = await workspace.openTextDocument(path.join(dir, 'off.ts'))
    const settings = workspace.getConfiguration('groq')
    await settings.update('enableFormatting', false, ConfigurationTarget.Global)
    try {
      assert.equal((await formatLenses(doc)).length, 0)
    } finally {
      await settings.update('enableFormatting', undefined, ConfigurationTarget.Global)
    }
  })
})
