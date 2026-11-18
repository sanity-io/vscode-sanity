import assert from 'node:assert'
import {rmSync, writeFileSync} from 'node:fs'
import {createServer, type Server} from 'node:http'
import type {AddressInfo} from 'node:net'
import path from 'node:path'
import vscode from 'vscode'

const project = process.env.SANITY_TEST_EXECUTE_PROJECT

// The tsgo run opens the hover fixture, which has no sanity.cli.ts. A skipped suite runs no hooks.
const suite = project ? describe : describe.skip

function write(file: string, content: string) {
  writeFileSync(path.join(project!, file), content)
}

suite('sanity.cli.ts with values from .env files', () => {
  let server: Server
  let requested: Array<string>
  const files = ['.env', '.env.local', '.env.development']

  before(async () => {
    requested = []
    server = createServer((req, res) => {
      requested.push(req.url ?? '')
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ms: 1, query: '*', result: []}))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const apiHost = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    // The API host comes from .env too, and expands the project id so the request shows it.
    write(
      '.env',
      `SANITY_STUDIO_PROJECT_ID=fromenv\nSANITY_STUDIO_DATASET=base\nSANITY_TEST_API_HOST=${apiHost}/\${SANITY_STUDIO_PROJECT_ID}\n`,
    )
    write('.env.local', 'SANITY_STUDIO_PROJECT_ID=fromlocal\nSANITY_STUDIO_DATASET=from-local\n')
    write('.env.development', 'SANITY_STUDIO_DATASET=from-development\n')
  })

  after(async () => {
    for (const file of files) {
      rmSync(path.join(project!, file), {force: true})
    }
    await new Promise((resolve) => server.close(resolve))
  })

  it('queries the project and dataset from .env, .env.local and .env.development', async () => {
    await vscode.commands.executeCommand('sanity.executeGroq', '*[_type == "post"]')

    assert.strictEqual(
      requested.length,
      1,
      `expected one request, got ${JSON.stringify(requested)}`,
    )
    const url = new URL(requested[0], 'http://localhost')
    // .env.local overrides the project id in .env, and .env.development overrides the dataset.
    assert.match(url.pathname, /^\/fromlocal\/v[^/]+\/data\/query\/from-development$/)
  })

  it('does not leave the variables behind in the extension host', () => {
    assert.strictEqual(process.env.SANITY_STUDIO_PROJECT_ID, undefined)
    assert.strictEqual(process.env.SANITY_STUDIO_DATASET, undefined)
    assert.strictEqual(process.env.SANITY_TEST_API_HOST, undefined)
  })
})
