import {format} from '../groq-format-wasm/pkg/groq_format'

export const DEFAULT_FORMAT_WIDTH = 80

/**
 * Formats a GROQ query with groq-format, wrapped to `width` columns, comments kept. Returns
 * `undefined` if the query cannot be parsed, so callers can fall back to showing it as-is.
 */
export function formatGroq(query: string, width = DEFAULT_FORMAT_WIDTH): string | undefined {
  return format(query, width)?.trimEnd()
}
