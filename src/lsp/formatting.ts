import {format, WasmError} from '@sanity-labs/groq-wasm'
import {extractQueries} from '@sanity-labs/groq-lsp'
import type {FormattingOptions, TextEdit} from 'vscode-languageserver'
import type {TextDocument} from 'vscode-languageserver-textdocument'

/** groq-format always indents with two spaces per level. */
const GROQ_FORMAT_INDENT = '  '

/**
 * Formats a GROQ query with groq-format, indented with `options.tabSize` spaces or a tab per level.
 * Returns `undefined` if the query cannot be parsed.
 */
export function formatGroqQuery(query: string, options: FormattingOptions): string | undefined {
  let formatted: string
  try {
    formatted = format(query).trimEnd()
  } catch (error) {
    if (error instanceof WasmError && error.code === 'PARSE_ERROR') {
      return undefined
    }
    throw error
  }
  const unit = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t'
  if (unit === GROQ_FORMAT_INDENT) {
    return formatted
  }
  // groq-format escapes line breaks inside strings, so leading spaces on a line are always indentation.
  return formatted.replaceAll(/^(?: {2})+/gm, (indent) =>
    unit.repeat(indent.length / GROQ_FORMAT_INDENT.length),
  )
}

/** Edits that format the `.groq` file, or each groq`` template literal in other languages. */
export function formatGroqDocument(
  document: TextDocument,
  options: FormattingOptions,
): Array<TextEdit> {
  const {queries} = extractQueries(document.getText(), document.languageId)
  return queries.flatMap((query) => {
    const newText = formatGroqQuery(query.query, options)
    if (newText === undefined || newText === query.query) {
      return []
    }
    const range = {start: document.positionAt(query.start), end: document.positionAt(query.end)}
    return [{range, newText}]
  })
}
