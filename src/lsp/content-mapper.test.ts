import {strict as assert} from 'node:assert'
import {spawn} from 'node:child_process'
import type {ChildProcess} from 'node:child_process'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {after, before, describe, it} from 'node:test'
import {
  createProtocolConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-languageserver-protocol/node'
import type {Diagnostic, ProtocolConnection} from 'vscode-languageserver-protocol/node'

const SERVER = path.join(__dirname, '..', '..', 'dist', 'server.js')
const PROJECT = path.join(__dirname, '..', '..', 'fixtures', 'hover-project')

const read = (file: string) => readFileSync(path.join(PROJECT, file), 'utf8')
const positionOf = (text: string, needle: string) => {
  const before = text.slice(0, text.indexOf(needle))
  return {
    line: before.split('\n').length - 1,
    character: before.length - before.lastIndexOf('\n') - 1,
  }
}

// fixtures/hover-project/tsconfig.json configures @sanity-labs/groq-content-mapper with
// `schema: ./schema.json` and `functions: ["groq/*.groq"]`. No workspace folder or
// `groq.schemaPath` is given, so both come from the tsconfig.
void describe('bundled GROQ language server with groq-content-mapper settings', () => {
  let server: ChildProcess
  let connection: ProtocolConnection
  const diagnostics = new Map<string, Array<Diagnostic>>()
  const waiters: Array<() => void> = []

  async function diagnosticsFor(uri: string, until: (d: Array<Diagnostic>) => boolean) {
    const deadline = Date.now() + 10_000
    while (!diagnostics.has(uri) || !until(diagnostics.get(uri) ?? [])) {
      if (Date.now() > deadline) {
        assert.fail(`No matching diagnostics for ${uri}: ${JSON.stringify(diagnostics.get(uri))}`)
      }
      await new Promise<void>((resolve) => {
        waiters.push(resolve)
        setTimeout(resolve, 200)
      })
    }
    return diagnostics.get(uri) ?? []
  }

  function open(file: string, languageId: string, text: string) {
    const uri = pathToFileURL(path.join(PROJECT, file)).toString()
    void connection.sendNotification('textDocument/didOpen', {
      textDocument: {uri, languageId, version: 1, text},
    })
    return uri
  }

  before(async () => {
    server = spawn(process.execPath, [SERVER, '--stdio'], {stdio: ['pipe', 'pipe', 'inherit']})
    connection = createProtocolConnection(
      new StreamMessageReader(server.stdout!),
      new StreamMessageWriter(server.stdin!),
    )
    connection.onNotification('textDocument/publishDiagnostics', (params) => {
      diagnostics.set(params.uri, params.diagnostics)
      waiters.splice(0).forEach((resolve) => resolve())
    })
    connection.onRequest('client/registerCapability', () => null)
    connection.listen()
    await connection.sendRequest('initialize', {
      processId: process.pid,
      rootUri: null,
      workspaceFolders: null,
      capabilities: {},
    })
    await connection.sendNotification('initialized', {})
  })

  after(() => {
    connection.dispose()
    server.kill()
  })

  void it('lints a .groq file that calls the shared custom functions without a parse error', async () => {
    assert.match(readFileSync(path.join(PROJECT, 'groq', 'image.groq'), 'utf8'), /image::field/)
    const found = await diagnosticsFor(
      open(
        'src/withImage.groq',
        'groq',
        '*[_type == "post"][0]{_id, "image": image::field(mainImage)}\n',
      ),
      () => true,
    )
    assert.deepEqual(found, [])
  })

  void it('uses the schema the tsconfig names', async () => {
    const found = await diagnosticsFor(
      open('src/unknownType.groq', 'groq', '*[_type == "notInTheSchema"]{_id}'),
      (d) => d.length > 0,
    )
    assert.deepEqual(
      found.map((d) => d.code),
      ['invalid-type-filter'],
    )
  })

  void it('hovers a field as its schema type and _type in a filter as the document types', async () => {
    const query = '*[_type == "post"][0]{_id, title}'
    const uri = open('src/hoverTypes.groq', 'groq', query)
    await diagnosticsFor(uri, () => true)

    const hoverAt = (character: number) =>
      connection.sendRequest<{contents: {value: string}} | null>('textDocument/hover', {
        textDocument: {uri},
        position: {line: 0, character},
      })

    const title = await hoverAt(query.indexOf('title') + 1)
    assert.match(title?.contents.value ?? '', /title: string/, JSON.stringify(title))

    const typeName = await hoverAt(query.indexOf('_type') + 1)
    assert.match(typeName?.contents.value ?? '', /_type: "post"/, JSON.stringify(typeName))
  })

  void it('goes from a custom function call to its definition in another .groq file', async () => {
    const text = read('queries/slugPage.groq')
    const uri = open('queries/slugPage.groq', 'groq', text)
    const links = await connection.sendRequest<
      Array<{targetUri: string; targetSelectionRange: {start: {line: number; character: number}}}>
    >('textDocument/definition', {
      textDocument: {uri},
      position: positionOf(text, 'richText'),
    })
    assert.equal(links.length, 1)
    assert.equal(
      links[0].targetUri,
      pathToFileURL(path.join(PROJECT, 'groq/richText.groq')).toString(),
    )
    assert.deepEqual(
      links[0].targetSelectionRange.start,
      positionOf(read('groq/richText.groq'), 'image::richText'),
    )
  })

  void it('finds the calls of a custom function in function files and queries', async () => {
    const text = read('groq/image.groq')
    const uri = open('groq/image.groq', 'groq', text)
    const locations = await connection.sendRequest<
      Array<{uri: string; range: {start: {line: number; character: number}}}>
    >('textDocument/references', {
      textDocument: {uri},
      position: positionOf(text, 'field('),
      context: {includeDeclaration: false},
    })
    const longQueryCalls = read('src/longQuery.groq').split('image::field(').length - 1
    assert.ok(longQueryCalls > 0)
    assert.deepEqual(
      locations.map((location) => path.relative(PROJECT, new URL(location.uri).pathname)),
      ['groq/richText.groq', ...Array.from({length: longQueryCalls}, () => 'src/longQuery.groq')],
    )
    assert.deepEqual(
      locations[0].range.start,
      positionOf(read('groq/richText.groq'), 'image::field(image)'),
    )

    const calls = await connection.sendRequest<Array<{uri: string}>>('textDocument/references', {
      textDocument: {uri},
      position: positionOf(text, 'asset('),
      context: {includeDeclaration: true},
    })
    assert.deepEqual(
      calls.map((location) => path.relative(PROJECT, new URL(location.uri).pathname)),
      ['groq/image.groq', 'groq/image.groq', 'groq/richText.groq'],
    )
  })
})
