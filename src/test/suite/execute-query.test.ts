import assert from 'node:assert'
import {createServer} from 'node:http'
import type {Server} from 'node:http'
import vscode from 'vscode'

const tsgo = process.env.SANITY_TEST_TSGO

// The tsgo run opens the hover fixture, which has no sanity.cli.ts. A skipped suite runs no hooks.
const suite = tsgo ? describe.skip : describe

suite('Execute GROQ query', () => {
  let server: Server
  let requested: Array<string>
  const config = vscode.workspace.getConfiguration('sanity')

  before(async () => {
    server = createServer((req, res) => {
      requested.push(req.url ?? '')
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ms: 1, query: '*', result: []}))
    })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    assert.ok(address && typeof address === 'object', 'server is listening on a port')
    process.env.SANITY_TEST_API_HOST = `http://127.0.0.1:${address.port}`
  })

  after(async () => {
    delete process.env.SANITY_TEST_API_HOST
    await new Promise((resolve) => {
      server.close(resolve)
    })
  })

  beforeEach(async () => {
    requested = []
    await config.update('openJSONFile', true, vscode.ConfigurationTarget.Global)
  })

  afterEach(async () => {
    await config.update('apiVersion', undefined, vscode.ConfigurationTarget.Global)
    await config.update('openJSONFile', undefined, vscode.ConfigurationTarget.Global)
  })

  async function execute() {
    await vscode.commands.executeCommand('sanity.executeGroq', '*[_type == "post"]')
    assert.strictEqual(
      requested.length,
      1,
      `expected one request, got ${JSON.stringify(requested)}`
    )
    return new URL(requested[0], 'http://localhost')
  }

  it('contributes a sanity.apiVersion setting with a dated default', () => {
    const inspected = config.inspect<string>('apiVersion')
    assert.match(inspected?.defaultValue ?? '', /^v\d{4}-\d{2}-\d{2}$/)
  })

  it('queries the default API version when the setting is not changed', async () => {
    const url = await execute()
    assert.ok(url.pathname.startsWith('/v2025-02-19/data/query/production'), url.pathname)
  })

  it('queries the API version from sanity.apiVersion', async () => {
    await config.update('apiVersion', 'v2021-03-25', vscode.ConfigurationTarget.Global)
    const url = await execute()
    assert.ok(url.pathname.startsWith('/v2021-03-25/data/query/production'), url.pathname)
  })

  it('loads a sanity.cli.ts importing CommonJS named exports on every run', async () => {
    await execute()
    requested = []
    await execute()
  })

  it('falls back to the default when sanity.apiVersion is invalid', async () => {
    await config.update('apiVersion', 'latest', vscode.ConfigurationTarget.Global)
    const url = await execute()
    assert.ok(url.pathname.startsWith('/v2025-02-19/data/query/production'), url.pathname)
  })
})
