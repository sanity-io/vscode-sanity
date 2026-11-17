import {parse} from 'groq-js'

export interface GroqInHover {
  /** The decoded query, with real line breaks and no JS string escaping. */
  query: string
  /** How the query was spelled in the hover text. */
  form: 'string' | 'template'
}

const FENCE = /^[ \t]*(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^[ \t]*\1[ \t]*$/gm
const GROQ_COMMENT_MARKER = /\/\*\s*groq\s*\*\/\s*$/i
// Single and double quoted literals cannot span lines; template literals can.
const LITERAL = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\[\s\S])*)`/g
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

export function isGroqQuery(candidate: string, hasGroqMarker = false): boolean {
  const query = candidate.trim()
  if (!query || (!hasGroqMarker && !EVERYTHING.test(query))) return false
  try {
    parse(query)
    return true
  } catch {
    return false
  }
}

function codeBlocks(markdown: string): string[] {
  const blocks: string[] = []
  FENCE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = FENCE.exec(markdown)) !== null) {
    blocks.push(match[2])
  }
  return blocks
}

/** Finds GROQ queries inside string literals of one code snippet. */
export function findGroqInCode(code: string): GroqInHover[] {
  const found: GroqInHover[] = []
  LITERAL.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = LITERAL.exec(code)) !== null) {
    const [, double, single, template] = match
    const form = template === undefined ? 'string' : 'template'
    const body = double ?? single ?? template
    const hasMarker = template !== undefined && GROQ_COMMENT_MARKER.test(code.slice(0, match.index))
    const query = decodeEscapes(body)
    if (isGroqQuery(query, hasMarker)) {
      found.push({query: query.trim(), form})
    }
  }
  return found
}

/**
 * Finds GROQ queries in the markdown of a TypeScript hover. Only fenced code is inspected, so
 * quotes in JSDoc prose are never mistaken for string literals.
 */
export function findGroqInHoverMarkdown(markdown: string): GroqInHover[] {
  return codeBlocks(markdown).flatMap(findGroqInCode)
}
