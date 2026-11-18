export type Token =
  | {kind: 'ident'; value: string; start: number; end: number}
  | {kind: 'string'; value: string; start: number; end: number}
  | {kind: 'punct'; value: string; start: number; end: number}
  | {
      kind: 'template'
      /** Raw text of each part between the interpolations, still escaped. */
      quasis: Array<string>
      /** One entry per `${}`: the tokens inside it and its source text. */
      exprs: Array<{tokens: Array<Token>; text: string}>
      start: number
      end: number
    }

const IDENT_START = /[A-Za-z_$]/
const IDENT_PART = /[\w$]/
const WHITESPACE = /\s/
// After one of these a `/` divides, anywhere else it starts a regular expression.
const DIVISION_BEFORE = new Set([')', ']', '}'])
const KEYWORDS_BEFORE_REGEX = new Set([
  'return',
  'typeof',
  'case',
  'in',
  'of',
  'void',
  'delete',
  'throw',
])
const SIMPLE_ESCAPES = new Map([
  ['n', '\n'],
  ['r', '\r'],
  ['t', '\t'],
  ['b', '\b'],
  ['f', '\f'],
  ['v', '\v'],
  ['0', '\0'],
])

function unescapeString(raw: string): string {
  return raw.replaceAll(/\\(?:u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|([\s\S]))/g, (_, u, x, c) => {
    if (u || x) {
      return String.fromCharCode(Number.parseInt(u || x, 16))
    }
    return SIMPLE_ESCAPES.get(c) ?? c
  })
}

interface Scan {
  tokens: Array<Token>
  /** Where scanning stopped: the end of the source, or the `}` closing an interpolation. */
  end: number
}

function scanTokens(source: string, from: number, stopAtBrace: boolean): Scan {
  const tokens: Array<Token> = []
  let i = from
  let braceDepth = 0

  const regexAllowed = () => {
    const last = tokens.at(-1)
    if (!last) {
      return true
    }
    if (last.kind === 'punct') {
      return !DIVISION_BEFORE.has(last.value)
    }
    return last.kind === 'ident' && KEYWORDS_BEFORE_REGEX.has(last.value)
  }

  while (i < source.length) {
    const char = source[i]

    if (WHITESPACE.test(char)) {
      i++
    } else if (char === '/' && source[i + 1] === '/') {
      const newline = source.indexOf('\n', i)
      i = newline === -1 ? source.length : newline + 1
    } else if (char === '/' && source[i + 1] === '*') {
      const close = source.indexOf('*/', i + 2)
      i = close === -1 ? source.length : close + 2
    } else if (char === '"' || char === "'") {
      const start = i
      i++
      while (i < source.length && source[i] !== char && source[i] !== '\n') {
        i += source[i] === '\\' ? 2 : 1
      }
      const raw = source.slice(start + 1, Math.min(i, source.length))
      i++
      tokens.push({
        kind: 'string',
        value: unescapeString(raw),
        start,
        end: Math.min(i, source.length),
      })
    } else if (char === '`') {
      const start = i
      const quasis: Array<string> = []
      const exprs: Array<{tokens: Array<Token>; text: string}> = []
      let quasiStart = i + 1
      i++
      while (i < source.length && source[i] !== '`') {
        if (source[i] === '\\') {
          i += 2
        } else if (source[i] === '$' && source[i + 1] === '{') {
          quasis.push(source.slice(quasiStart, i))
          const inner = scanTokens(source, i + 2, true)
          exprs.push({tokens: inner.tokens, text: source.slice(i + 2, inner.end)})
          i = inner.end + 1
          quasiStart = i
        } else {
          i++
        }
      }
      quasis.push(source.slice(quasiStart, Math.min(i, source.length)))
      i++
      tokens.push({kind: 'template', quasis, exprs, start, end: Math.min(i, source.length)})
    } else if (char === '/' && regexAllowed()) {
      const start = i
      let inClass = false
      i++
      while (i < source.length && source[i] !== '\n' && (inClass || source[i] !== '/')) {
        if (source[i] === '\\') {
          i++
        } else if (source[i] === '[') {
          inClass = true
        } else if (source[i] === ']') {
          inClass = false
        }
        i++
      }
      i++
      while (i < source.length && IDENT_PART.test(source[i])) {
        i++
      }
      tokens.push({kind: 'punct', value: 'regex', start, end: i})
    } else if (IDENT_START.test(char)) {
      const start = i
      while (i < source.length && IDENT_PART.test(source[i])) {
        i++
      }
      tokens.push({kind: 'ident', value: source.slice(start, i), start, end: i})
    } else {
      if (char === '{') {
        braceDepth++
      } else if (char === '}') {
        if (stopAtBrace && braceDepth === 0) {
          return {tokens, end: i}
        }
        braceDepth--
      }
      tokens.push({kind: 'punct', value: char, start: i, end: i + 1})
      i++
    }
  }

  return {tokens, end: source.length}
}

/**
 * A forgiving JavaScript and TypeScript tokenizer: enough to tell code from strings, template
 * literals and comments. It never throws, so half-typed code still yields tokens.
 */
export function tokenize(source: string): Array<Token> {
  return scanTokens(source, 0, false).tokens
}
