import {promises as fs} from 'fs'
import '@groqfmt/wasm/dist/wasm-exec'

type GroqfmtResult =
  | {result: string; error: undefined}
  | {result: undefined; error: {message: string}}

interface GoRuntime {
  importObject: WebAssembly.Imports
  run(instance: WebAssembly.Instance): Promise<void>
}

let groqfmt: Promise<(query: string) => GroqfmtResult> | undefined

function loadGroqfmt() {
  groqfmt ??= (async () => {
    const Go = (globalThis as unknown as {Go: new () => GoRuntime}).Go
    const go = new Go()
    const wasm = await fs.readFile(require.resolve('@groqfmt/wasm/dist/groqfmt.wasm'))
    const {instance} = await WebAssembly.instantiate(wasm, go.importObject)
    // The Go program blocks forever to keep `groqfmt` registered, so this promise never settles.
    void go.run(instance)
    return (globalThis as unknown as {groqfmt: (query: string) => GroqfmtResult}).groqfmt
  })().catch((err) => {
    groqfmt = undefined
    throw err
  })
  return groqfmt
}

/**
 * Formats a GROQ query using groqfmt, which lays out projections and filters on separate lines. Returns `undefined` if the query cannot
 * be parsed, so callers can fall back to showing it as-is.
 */
export async function formatGroq(query: string): Promise<string | undefined> {
  const format = await loadGroqfmt()
  const {result} = format(query)
  return result?.trimEnd()
}
