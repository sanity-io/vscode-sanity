import {parse} from 'groq-js'

export type GroqInHover =
  | {
      kind: 'query'
      /** The decoded query, with real line breaks and no JS string escaping. */
      query: string
      /**
       * How the query was spelled in the hover text: a string or template literal in the type, or
       * a fenced `groq` block in the documentation (groq-content-mapper writes one).
       */
      form: 'string' | 'template' | 'doc-block'
    }
  | {
      kind: 'truncated'
      /** What the language server printed of the query before cutting it off, decoded. */
      partial: string
      form: 'string' | 'template'
    }

type LiteralForm = 'string' | 'template'

interface Literal {
  form: LiteralForm
  /** Raw text between the quotes, still escaped. */
  body: string
  start: number
  terminated: boolean
}

const FENCE = /^[ \t]*(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)^[ \t]*\1[ \t]*$/gm
const GROQ_COMMENT_MARKER = /\/\*\s*groq\s*\*\/\s*$/i
const TRUNCATION_MARK = /\.\.\.\s*$/
// A cut can land between a backslash and the character it escapes.
const DANGLING_ESCAPE = /((?:^|[^\\])(?:\\\\)*)\\$/
const SIMPLE_ESCAPES: Record<string, string> = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  v: '\v',
  '0': '\0',
}
const ESCAPE = /\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|\r\n|([\s\S]))/g
// An "everything" (`*`) reference followed by a filter, pipe, or the end of an expression.
const EVERYTHING = /(?:^|[\s(,{:=|])\*\s*(?:\[|\||\)|$)/
// Custom function definitions the content mapper prepends: `fn image::asset($asset) = ...;`
const CUSTOM_FUNCTION = /(?:^|\n)\s*fn\s+\w+::\w+\s*\(/
const PARAMETER = /\$[A-Za-z_]\w*/g

/**
 * Decodes the body of a JS/TS string or template literal, as it would be printed by TypeScript
 * (e.g. quick info prints `"*[_type == \"post\"]{\n  title\n}"`).
 */
export function decodeEscapes(raw: string): string {
  return raw.replace(ESCAPE, (_match, codePoint, unicode, hex, char) => {
    if (codePoint !== undefined) {
      const value = parseInt(codePoint, 16)
      return value <= 0x10ffff ? String.fromCodePoint(value) : ''
    }
    if (unicode !== undefined) return String.fromCharCode(parseInt(unicode, 16))
    if (hex !== undefined) return String.fromCharCode(parseInt(hex, 16))
    if (char === undefined || char === '\n' || char === '\r') return ''
    return SIMPLE_ESCAPES[char] ?? char
  })
}

function looksLikeGroq(query: string, hasGroqMarker: boolean): boolean {
  return hasGroqMarker || EVERYTHING.test(query) || CUSTOM_FUNCTION.test(query)
}

export function isGroqQuery(candidate: string, hasGroqMarker = false): boolean {
  const query = candidate.trim()
  if (!query || !looksLikeGroq(query, hasGroqMarker)) return false

  // groq-js evaluates constant slices while parsing, so give `[$start...$end]` numbers to chew on.
  const params = Object.fromEntries(
    (query.match(PARAMETER) ?? []).map((name) => [name.slice(1), 0])
  )
  try {
    parse(query, {params})
    return true
  } catch (err) {
    // Only syntax errors say it is not GROQ. Anything else (such as a slice groq-js cannot fold)
    // is a query that parsed.
    return err instanceof Error && err.name !== 'GroqSyntaxError'
  }
}

function codeBlocks(markdown: string): {language: string; code: string}[] {
  const blocks: {language: string; code: string}[] = []
  FENCE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = FENCE.exec(markdown)) !== null) {
    blocks.push({language: match[2].trim().toLowerCase(), code: match[3]})
  }
  return blocks
}

/**
 * Finds the string and template literals in a code snippet. A quote that is still open at the end
 * of the snippet yields an unterminated literal, which is how a truncated hover looks.
 */
function scanLiterals(code: string): Literal[] {
  const literals: Literal[] = []
  let i = 0
  while (i < code.length) {
    const quote = code[i]
    if (quote !== '"' && quote !== "'" && quote !== '`') {
      i++
      continue
    }
    const form: LiteralForm = quote === '`' ? 'template' : 'string'
    const start = i
    let end = i + 1
    while (end < code.length && code[end] !== quote) {
      if (code[end] === '\\') end++
      else if (code[end] === '\n' && quote !== '`') break
      end++
    }
    const terminated = code[end] === quote
    if (!terminated && end < code.length && code[end] === '\n') {
      // A quote that stops at a line end is not a literal (e.g. an apostrophe).
      i = start + 1
      continue
    }
    literals.push({
      form,
      body: code.slice(start + 1, Math.min(end, code.length)),
      start,
      terminated,
    })
    i = end + 1
  }
  return literals
}

/** Finds GROQ queries inside string literals of one code snippet. */
export function findGroqInCode(snippet: string): GroqInHover[] {
  const code = snippet.trimEnd()
  const found: GroqInHover[] = []
  for (const literal of scanLiterals(code)) {
    const hasMarker =
      literal.form === 'template' && GROQ_COMMENT_MARKER.test(code.slice(0, literal.start))

    if (literal.terminated) {
      const query = decodeEscapes(literal.body)
      if (isGroqQuery(query, hasMarker)) {
        found.push({kind: 'query', query: query.trim(), form: literal.form})
      }
      continue
    }

    // Language servers cut long hovers off with "..." and leave the literal open, so what is left
    // is a broken query that must not be formatted.
    if (TRUNCATION_MARK.test(code)) {
      const partial = decodeEscapes(
        literal.body.replace(TRUNCATION_MARK, '').replace(DANGLING_ESCAPE, '$1')
      )
      if (looksLikeGroq(partial.trim(), hasMarker)) {
        found.push({kind: 'truncated', partial: partial.trim(), form: literal.form})
      }
    }
  }
  return found
}

/**
 * The query with trailing whitespace dropped from each line, which a doc comment does not keep,
 * so the type's literal and the doc block compare equal.
 */
export function comparable(query: string): string {
  return query
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()
}

/**
 * Finds GROQ queries in the markdown of a TypeScript hover. Only fenced code is inspected, so
 * quotes in JSDoc prose are never mistaken for string literals. A fenced `groq` block is taken as
 * a query as it is. When the type is cut off but the same query is also in such a block, the
 * block wins and no truncation is reported.
 */
export function findGroqInHoverMarkdown(markdown: string): GroqInHover[] {
  const found: GroqInHover[] = []
  for (const {language, code} of codeBlocks(markdown)) {
    if (language === 'groq') {
      const query = code.trim()
      if (query) found.push({kind: 'query', query, form: 'doc-block'})
    } else {
      found.push(...findGroqInCode(code))
    }
  }

  const queries = found.flatMap((hit) => (hit.kind === 'query' ? [comparable(hit.query)] : []))
  return found.filter(
    (hit) =>
      hit.kind === 'query' || !queries.some((query) => query.startsWith(comparable(hit.partial)))
  )
}
