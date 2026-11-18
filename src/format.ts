import {format, WasmError} from '@sanity-labs/groq-wasm'

export const DEFAULT_FORMAT_WIDTH = 80

/**
 * Formats a GROQ query with groq-format, wrapped to `width` columns, comments kept. Returns
 * `undefined` if the query cannot be parsed, so callers can fall back to showing it as-is.
 */
export function formatGroq(query: string, width = DEFAULT_FORMAT_WIDTH): string | undefined {
  try {
    return format(query, {width}).trimEnd()
  } catch (error) {
    if (error instanceof WasmError && error.code === 'PARSE_ERROR') return undefined
    throw error
  }
}
