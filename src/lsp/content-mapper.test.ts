import {strict as assert} from 'node:assert'
import {spawn, type ChildProcess} from 'node:child_process'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {after, before, describe, it} from 'node:test'
import {
  createProtocolConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type Diagnostic,
  type ProtocolConnection,
} from 'vscode-languageserver-protocol/node'

const SERVER = path.join(__dirname, '..', '..', 'dist', 'server.js')
const PROJECT = path.join(__dirname, '..', '..', 'fixtures', 'hover-project')

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

  void it('hovers a field as its schema type and _type as the filtered document type', async () => {
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
    assert.match(typeName?.contents.value ?? '', /_type: post/, JSON.stringify(typeName))
  })
})
