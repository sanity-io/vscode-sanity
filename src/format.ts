import {readFileSync} from 'node:fs'
import path from 'node:path'
import {format, initWasm, WasmError} from '@sanity-labs/groq-wasm/lazy'

export const DEFAULT_FORMAT_WIDTH = 80

/**
 * Hovers are narrower than the editor: a line that fits 80 columns is soft-wrapped mid-expression by
 * the tooltip, so hovers wrap queries to fewer columns and break on GROQ boundaries instead.
 */
export const DEFAULT_HOVER_FORMAT_WIDTH = 40

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

/**
 * Whether a query spelled as `source` in a JavaScript or TypeScript template literal can be
 * rewritten in place: with `${}` interpolations it is not GROQ yet, and with backslashes the source
 * text differs from the query string, so the formatter would see a different query.
 */
export function canFormatInSource(source: string): boolean {
  return !source.includes('${') && !source.includes('\\')
}

/**
 * The indent of the line the query starts on: the spaces or tabs between the previous newline and
 * the query. Empty when the query starts mid-line, since that prefix is code, not indent.
 */
function indentOfQueryLine(leading: string): string {
  const indent = leading.slice(leading.lastIndexOf('\n') + 1)
  return /^[ \t]*$/.test(indent) ? indent : ''
}

/**
 * Formats the query in `source` and keeps the whitespace around it, so a query on its own lines
 * inside a template literal, or a `.groq` file's final newline, stay where they were. Continuation
 * lines keep the indent of the line the query starts on. Returns `undefined` if the query cannot
 * be parsed.
 */
export function formatQuerySource(source: string): string | undefined {
  const query = source.trim()
  if (!query) {
    return undefined
  }
  const formatted = formatGroq(query)
  if (formatted === undefined) {
    return undefined
  }
  const start = source.indexOf(query)
  const leading = source.slice(0, start)
  const indent = indentOfQueryLine(leading)
  const indented = indent
    ? formatted
        .split('\n')
        .map((line, index) => (index === 0 || line.length === 0 ? line : indent + line))
        .join('\n')
    : formatted
  return leading + indented + source.slice(start + query.length)
}
