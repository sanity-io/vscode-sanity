import {strict as assert} from 'node:assert'
import {spawn, type ChildProcess} from 'node:child_process'
import path from 'node:path'
import {after, before, describe, it} from 'node:test'
import {
  createProtocolConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type Diagnostic,
  type ProtocolConnection,
  type TextEdit,
} from 'vscode-languageserver-protocol/node'
import type {ServerSettings} from './settings'

const SERVER = path.join(__dirname, '..', '..', 'dist', 'server.js')

const GROQ = '*[_type == "post" && author->name == "x"]{title,"n": count(*[references(^._id)])}'
const TS = 'const ok = groq`*[_type == "post"]{  title,body}`\nconst bad = groq`*[_type == ]`\n'

void describe('bundled GROQ language server (dist/server.js)', () => {
  let server: ChildProcess
  let connection: ProtocolConnection
  const diagnostics = new Map<string, Array<Diagnostic>>()
  const waiters: Array<() => void> = []

  async function diagnosticsFor(uri: string, until: (d: Array<Diagnostic>) => boolean) {
    const deadline = Date.now() + 10_000
    while (!until(diagnostics.get(uri) ?? [])) {
      if (Date.now() > deadline) {
        assert.fail(`No matching diagnostics for ${uri}`)
      }
      await new Promise<void>((resolve) => {
        waiters.push(resolve)
        setTimeout(resolve, 200)
      })
    }
    return diagnostics.get(uri) ?? []
  }

  function open(uri: string, languageId: string, text: string) {
    return connection.sendNotification('textDocument/didOpen', {
      textDocument: {uri, languageId, version: 1, text},
    })
  }

  function sendSettings(settings: ServerSettings) {
    return connection.sendNotification('workspace/didChangeConfiguration', {
      settings: {groq: settings},
    })
  }

  function format(uri: string): Promise<Array<TextEdit>> {
    return connection.sendRequest('textDocument/formatting', {
      textDocument: {uri},
      options: {tabSize: 2, insertSpaces: true},
    })
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
      capabilities: {workspace: {configuration: true, didChangeConfiguration: {}}},
    })
    await connection.sendNotification('initialized', {})
    await open('file:///q.groq', 'groq', GROQ)
    await open('file:///q.ts', 'typescript', TS)
  })

  after(() => {
    connection.dispose()
    server.kill()
  })

  void it('lints .groq files', async () => {
    const found = await diagnosticsFor('file:///q.groq', (d) => d.length > 0)
    assert.deepEqual(
      found.map((d) => d.code).sort((a, b) => String(a).localeCompare(String(b))),
      ['count-in-correlated-subquery', 'join-in-filter'],
    )
  })

  void it('reports parse errors in groq`` template literals at their position', async () => {
    const [error, ...rest] = await diagnosticsFor('file:///q.ts', (d) => d.length > 0)
    assert.equal(rest.length, 0)
    assert.match(String(error.message), /Parse error/)
    assert.equal(error.range.start.line, 1)
  })

  void it('completes fields inside queries and nothing outside them', async () => {
    const inside = await connection.sendRequest<Array<{label: string}>>('textDocument/completion', {
      textDocument: {uri: 'file:///q.ts'},
      position: {line: 0, character: 'const ok = groq`*['.length},
    })
    assert.ok(inside.some((item) => item.label === '_type'))

    const outside = await connection.sendRequest<Array<unknown>>('textDocument/completion', {
      textDocument: {uri: 'file:///q.ts'},
      position: {line: 0, character: 3},
    })
    assert.deepEqual(outside, [])
  })

  void it('formats .groq files and the queries in template literals', async () => {
    const [groqEdit] = await format('file:///q.groq')
    assert.equal(
      groqEdit.newText,
      '*[_type == "post" && author->name == "x"] {\n  title,\n  "n": count(*[references(^._id)])\n}',
    )

    const tsEdits = await format('file:///q.ts')
    assert.deepEqual(
      tsEdits.map((edit) => edit.newText),
      ['*[_type == "post"] { title, body }'],
    )
  })

  void it('shows hover information for fields in .groq files', async () => {
    const hover = await connection.sendRequest<{contents: {value: string}} | null>(
      'textDocument/hover',
      {
        textDocument: {uri: 'file:///q.groq'},
        position: {line: 0, character: GROQ.indexOf('title') + 1},
      },
    )
    assert.ok(hover?.contents.value.includes('title'), JSON.stringify(hover))
  })

  void it('applies maxDiagnostics and enableFormatting from the groq settings', async () => {
    await sendSettings({maxDiagnostics: 1, enableFormatting: false})
    await diagnosticsFor('file:///q.groq', (d) => d.length === 1)
    assert.deepEqual(await format('file:///q.groq'), [])

    await sendSettings({maxDiagnostics: 100, enableFormatting: true})
    await diagnosticsFor('file:///q.groq', (d) => d.length === 2)
    assert.equal((await format('file:///q.groq')).length, 1)
  })
})
