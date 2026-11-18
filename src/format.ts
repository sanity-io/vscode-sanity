import {readFileSync} from 'node:fs'
import path from 'node:path'
import {format, initWasm, WasmError} from '@sanity-labs/groq-wasm/lazy'

export const DEFAULT_FORMAT_WIDTH = 80

// scripts/build.mjs copies the wasm into dist/. Resolving it from the extension root lets both the
// bundle (dist/extension.js) and the unit tests compiled by tsc (out/format.js) find it.
const WASM_PATH = path.join(__dirname, '..', 'dist', 'groq_wasm_bg.wasm')

let wasmLoaded = false

/**
 * Formats a GROQ query with groq-format, wrapped to `width` columns, comments kept. Returns
 * `undefined` if the query cannot be parsed, so callers can fall back to showing it as-is.
 */
export function formatGroq(query: string, width = DEFAULT_FORMAT_WIDTH): string | undefined {
  if (!wasmLoaded) {
    initWasm(readFileSync(WASM_PATH))
    wasmLoaded = true
  }
  try {
    return format(query, {width}).trimEnd()
  } catch (error) {
    if (error instanceof WasmError && error.code === 'PARSE_ERROR') {
      return undefined
    }
    throw error
  }
}
