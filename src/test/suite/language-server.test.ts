import {strict as assert} from 'node:assert'
import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {
  commands,
  ConfigurationTarget,
  languages,
  Position,
  window,
  workspace,
  WorkspaceEdit,
  type CodeLens,
  type CompletionList,
  type Diagnostic,
  type Location,
  type LocationLink,
  type TextDocument,
  type TextEdit,
  type Uri,
} from 'vscode'

const EXTENSION_ID = 'sanity-io.vscode-sanity'
const GROQ = '*[_type == "post" && author->name == "x"]{title,"n": count(*[references(^._id)])}\n'
const GROQ_FORMATTED =
  '*[_type == "post" && author->name == "x"] {\n  title,\n  "n": count(*[references(^._id)])\n}\n'
const TS = [
  "import groq from 'groq'",
  '',
  'export const posts = groq`*[_type == "post"]{  title,body}`',
  'export const broken = groq`*[_type == ]`',
  '    export   const   messy = 1',
  '',
].join('\n')

async function eventually<T>(
  read: () => Promise<T> | T,
  done: (value: T) => boolean,
  what: string,
): Promise<T> {
  const deadline = Date.now() + 60_000
  let value = await read()
  while (!done(value)) {
    if (Date.now() > deadline) {
      assert.fail(`Timed out waiting for ${what}: ${JSON.stringify(value)}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
    value = await read()
  }
  return value
}

async function completionLabels(uri: Uri, position: Position): Promise<Array<string>> {
  const list = await commands.executeCommand<CompletionList>(
    'vscode.executeCompletionItemProvider',
    uri,
    position,
  )
  return list.items.map((item) => (typeof item.label === 'string' ? item.label : item.label.label))
}

async function setGroq(key: string, value: unknown) {
  await workspace.getConfiguration('groq').update(key, value, ConfigurationTarget.Global)
}

function codes(diagnostics: Array<Diagnostic>): Array<string> {
  return diagnostics.map((d) => String(d.code)).sort((a, b) => a.localeCompare(b))
}

describe('GROQ language server', () => {
  let dir: string
  let groqDoc: TextDocument
  let tsDoc: TextDocument

  before(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'vscode-sanity-lsp-'))
    writeFileSync(path.join(dir, 'query.groq'), GROQ)
    writeFileSync(path.join(dir, 'queries.ts'), TS)
    groqDoc = await workspace.openTextDocument(path.join(dir, 'query.groq'))
    tsDoc = await workspace.openTextDocument(path.join(dir, 'queries.ts'))
    await window.showTextDocument(groqDoc)
  })

  after(async () => {
    await setGroq('maxDiagnostics', undefined)
    await setGroq('enable', undefined)
    await setGroq('schemaPath', undefined)
  })

  it('lints .groq files', async () => {
    const diagnostics = await eventually(
      () => languages.getDiagnostics(groqDoc.uri),
      (d) => d.length === 2,
      'diagnostics in query.groq',
    )
    assert.deepEqual(codes(diagnostics), ['count-in-correlated-subquery', 'join-in-filter'])

    const join = diagnostics.find((d) => d.code === 'join-in-filter')
    assert.ok(join)
    assert.equal(groqDoc.getText(join.range), 'author->')
  })

  it('goes to the definition of a custom function and finds its calls in other .groq files', async () => {
    const project = mkdtempSync(path.join(tmpdir(), 'vscode-sanity-lsp-functions-'))
    mkdirSync(path.join(project, 'groq'))
    mkdirSync(path.join(project, 'queries'))
    writeFileSync(
      path.join(project, 'tsconfig.json'),
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
    writeFileSync(
      path.join(project, 'groq', 'image.groq'),
      'fn image::asset($asset) = $asset->{url};\nfn image::field($image) = $image{crop, "asset": image::asset(asset)};\nfn image::richText($blocks) = $blocks[]{..., _type == "image" => image::field(@)};\n',
    )
    writeFileSync(
      path.join(project, 'queries', 'slugPage.groq'),
      '*[_type == "page" && slug.current == $slug][0]{_id, "body": image::richText(body)}\n',
    )
    const query = await workspace.openTextDocument(path.join(project, 'queries', 'slugPage.groq'))
    const functions = await workspace.openTextDocument(path.join(project, 'groq', 'image.groq'))
    await window.showTextDocument(query)

    const call = query.positionAt(query.getText().indexOf('richText'))
    const definitions = await eventually(
      async () =>
        await commands.executeCommand<Array<Location | LocationLink>>(
          'vscode.executeDefinitionProvider',
          query.uri,
          call,
        ),
      (found) => found.length > 0,
      'the definition of image::richText',
    )
    const [definition] = definitions
    const target = 'targetUri' in definition ? definition.targetUri : definition.uri
    const range =
      'targetUri' in definition
        ? (definition.targetSelectionRange ?? definition.targetRange)
        : definition.range
    assert.equal(target.fsPath, functions.uri.fsPath)
    assert.equal(functions.getText(range), 'image::richText')

    const field = functions.positionAt(functions.getText().indexOf('field(') + 1)
    const references = await commands.executeCommand<Array<Location>>(
      'vscode.executeReferenceProvider',
      functions.uri,
      field,
    )
    assert.deepEqual(
      references.map((reference) => [
        path.relative(project, reference.uri.fsPath),
        reference.range.start.line,
      ]),
      [
        [path.join('groq', 'image.groq'), 1],
        [path.join('groq', 'image.groq'), 2],
      ],
    )

    const richText = await commands.executeCommand<Array<Location>>(
      'vscode.executeReferenceProvider',
      functions.uri,
      functions.positionAt(functions.getText().indexOf('richText')),
    )
    assert.ok(
      richText.some((reference) => reference.uri.fsPath === query.uri.fsPath),
      JSON.stringify(richText),
    )
  })

  it('reports errors in groq`` template literals in TypeScript', async () => {
    // The fixture project used by the tsgo run has a schema, which adds a field error on line 2.
    const diagnostics = await eventually(
      () => languages.getDiagnostics(tsDoc.uri).filter((d) => d.source === 'groq'),
      (d) => d.some((diagnostic) => /Parse error/.test(String(diagnostic.message))),
      'a parse error in queries.ts',
    )
    const error = diagnostics.find((d) => /Parse error/.test(String(d.message)))
    assert.ok(error)
    assert.equal(error.range.start.line, 3)
  })

  it('lints queries with their interpolated fragments inlined', async () => {
    const fragmentPath = path.join(dir, 'author.ts')
    const queryPath = path.join(dir, 'article.ts')
    writeFileSync(fragmentPath, 'export const author = defineQuery(`{ name }`)\n')
    writeFileSync(
      queryPath,
      [
        "import {author} from './author'",
        'export const query = defineQuery(`*[_type == "article"]{ author->${author} }`)',
        '',
      ].join('\n'),
    )
    const query = await workspace.openTextDocument(queryPath)
    const fragment = await workspace.openTextDocument(fragmentPath)
    const groqDiagnostics = () =>
      languages.getDiagnostics(query.uri).filter((d) => d.source === 'groq')
    // Diagnostics are published, empty, once the server has linted the document.
    await new Promise((resolve) => setTimeout(resolve, 2000))
    assert.deepEqual(groqDiagnostics(), [])

    const edit = new WorkspaceEdit()
    const start = fragment.getText().indexOf('name')
    edit.insert(fragment.uri, fragment.positionAt(start + 'name'.length), ',,')
    await workspace.applyEdit(edit)
    const diagnostics = await eventually(
      groqDiagnostics,
      (d) => d.some((diagnostic) => /Parse error/.test(String(diagnostic.message))),
      'a parse error from the edited fragment',
    )
    assert.equal(diagnostics[0]?.range.start.line, 1)
  })

  it('completes fields in .groq files and in template literals', async () => {
    const inGroq = await eventually(
      () => completionLabels(groqDoc.uri, new Position(0, 2)),
      (labels) => labels.includes('_type'),
      'completions in query.groq',
    )
    assert.ok(inGroq.includes('_id'))

    const inTs = await completionLabels(
      tsDoc.uri,
      new Position(2, 'export const posts = groq`*['.length),
    )
    assert.ok(inTs.includes('_type'), JSON.stringify(inTs))
  })

  it('formats .groq files with Format Document', async () => {
    const edits = await commands.executeCommand<Array<TextEdit>>(
      'vscode.executeFormatDocumentProvider',
      groqDoc.uri,
      {tabSize: 2, insertSpaces: true},
    )
    const workspaceEdit = new WorkspaceEdit()
    workspaceEdit.set(groqDoc.uri, edits)
    await workspace.applyEdit(workspaceEdit)
    assert.equal(groqDoc.getText(), GROQ_FORMATTED)
  })

  it('does not register as a Format Document formatter for TypeScript', async () => {
    // With this extension picked as the TypeScript formatter, format on save would rewrite the
    // query if the language server's formatter were registered for TypeScript.
    const editor = workspace.getConfiguration('editor', {languageId: 'typescript'})
    const target = ConfigurationTarget.Global
    await editor.update('defaultFormatter', EXTENSION_ID, target, true)
    await editor.update('formatOnSave', true, target, true)
    try {
      const file = path.join(dir, 'formatted.ts')
      const source = 'export const posts = groq`*[_type == "post"]{  title,body}`\n'
      writeFileSync(file, '')
      const doc = await workspace.openTextDocument(file)
      const shown = await window.showTextDocument(doc)
      await shown.edit((edit) => edit.insert(new Position(0, 0), source))
      await doc.save()
      assert.equal(doc.getText(), source)
    } finally {
      await editor.update('defaultFormatter', undefined, target, true)
      await editor.update('formatOnSave', undefined, target, true)
    }
  })

  it('formats the queries in a TypeScript file with "GROQ: Format GROQ Queries"', async () => {
    await window.showTextDocument(tsDoc)
    await commands.executeCommand('groq.formatQueries')
    assert.equal(
      tsDoc.lineAt(2).text,
      'export const posts = groq`*[_type == "post"] { title, body }`',
    )
    assert.equal(tsDoc.lineAt(3).text, 'export const broken = groq`*[_type == ]`')
    assert.equal(tsDoc.lineAt(4).text, '    export   const   messy = 1')
  })

  it('uses the schema at groq.schemaPath for completion and linting', async () => {
    const schemaFile = path.join(dir, 'schema', 'extracted.json')
    mkdirSync(path.dirname(schemaFile))
    writeFileSync(
      schemaFile,
      JSON.stringify([{name: 'zebraArticle', type: 'document', attributes: {}}]),
    )
    const query = '*[_type == ""]'
    writeFileSync(path.join(dir, 'typed.groq'), query)
    const doc = await workspace.openTextDocument(path.join(dir, 'typed.groq'))
    const position = new Position(0, query.indexOf('""') + 1)

    assert.ok(!(await completionLabels(doc.uri, position)).includes('zebraArticle'))
    await setGroq('schemaPath', schemaFile)
    await eventually(
      () => completionLabels(doc.uri, position),
      (labels) => labels.includes('zebraArticle'),
      'the schema type to be completed',
    )
    await eventually(
      () => languages.getDiagnostics(groqDoc.uri),
      (d) => d.some((diagnostic) => diagnostic.code === 'invalid-type-filter'),
      'a diagnostic for the type missing from the schema',
    )

    await setGroq('schemaPath', undefined)
    await eventually(
      () => languages.getDiagnostics(groqDoc.uri),
      (d) => d.length === 2,
      'the schema diagnostic to go away',
    )
  })

  it('resolves a workspace-relative groq.schemaPath', async () => {
    const folder = workspace.workspaceFolders?.[0]
    assert.ok(folder)
    const schemaFile = path.join(folder.uri.fsPath, 'nested', 'zebra.json')
    mkdirSync(path.dirname(schemaFile), {recursive: true})
    writeFileSync(
      schemaFile,
      JSON.stringify([{name: 'relativeZebra', type: 'document', attributes: {}}]),
    )
    const query = '*[_type == ""]'
    const file = path.join(folder.uri.fsPath, 'relative.groq')
    writeFileSync(file, query)
    const doc = await workspace.openTextDocument(file)
    const position = new Position(0, query.indexOf('""') + 1)

    assert.ok(!(await completionLabels(doc.uri, position)).includes('relativeZebra'))
    await setGroq('schemaPath', 'nested/zebra.json')
    await eventually(
      () => completionLabels(doc.uri, position),
      (labels) => labels.includes('relativeZebra'),
      'the type from the relative schema path',
    )

    await setGroq('schemaPath', undefined)
    await eventually(
      () => languages.getDiagnostics(groqDoc.uri),
      (d) => d.length === 2 && d.every((diagnostic) => diagnostic.code !== 'invalid-type-filter'),
      'the relative schema to be unloaded',
    )
  })

  it('applies groq.maxDiagnostics', async () => {
    await setGroq('maxDiagnostics', 1)
    await eventually(
      () => languages.getDiagnostics(groqDoc.uri),
      (d) => d.length === 1,
      'one diagnostic',
    )
    await setGroq('maxDiagnostics', undefined)
    await eventually(
      () => languages.getDiagnostics(groqDoc.uri),
      (d) => d.length === 2,
      'two diagnostics',
    )
  })

  it('stops and restarts with groq.enable', async () => {
    await setGroq('enable', false)
    await eventually(
      () => languages.getDiagnostics(groqDoc.uri),
      (d) => d.length === 0,
      'diagnostics cleared',
    )
    await setGroq('enable', undefined)
    await eventually(
      () => languages.getDiagnostics(groqDoc.uri),
      (d) => d.length === 2,
      'diagnostics back',
    )
  })

  it('lints and formats an unsaved GROQ editor', async () => {
    const doc = await workspace.openTextDocument({language: 'groq', content: GROQ})
    assert.equal(doc.uri.scheme, 'untitled')
    await window.showTextDocument(doc)

    const diagnostics = await eventually(
      () => languages.getDiagnostics(doc.uri),
      (d) => d.length === 2,
      'diagnostics in an unsaved editor',
    )
    assert.deepEqual(codes(diagnostics), ['count-in-correlated-subquery', 'join-in-filter'])

    const edits = await commands.executeCommand<Array<TextEdit>>(
      'vscode.executeFormatDocumentProvider',
      doc.uri,
      {tabSize: 2, insertSpaces: true},
    )
    const workspaceEdit = new WorkspaceEdit()
    workspaceEdit.set(doc.uri, edits)
    await workspace.applyEdit(workspaceEdit)
    assert.equal(doc.getText(), GROQ_FORMATTED)
  })

  it('does not restart the server while groq.enable is off', async () => {
    await setGroq('enable', false)
    await eventually(
      () => languages.getDiagnostics(groqDoc.uri),
      (d) => d.length === 0,
      'diagnostics cleared',
    )

    await commands.executeCommand('groq.restartServer')
    // Long enough for a restarted server to publish diagnostics, which it must not.
    await new Promise((resolve) => setTimeout(resolve, 1500))
    assert.equal(languages.getDiagnostics(groqDoc.uri).length, 0)

    await setGroq('enable', undefined)
    await eventually(
      () => languages.getDiagnostics(groqDoc.uri),
      (d) => d.length === 2,
      'diagnostics back',
    )
  })

  it('still shows the "Execute Query" code lens', async () => {
    const lenses = await commands.executeCommand<Array<CodeLens>>(
      'vscode.executeCodeLensProvider',
      tsDoc.uri,
    )
    assert.ok(
      lenses.some((lens) => lens.command?.command === 'sanity.executeGroq'),
      JSON.stringify(lenses.map((lens) => lens.command)),
    )
  })
})
