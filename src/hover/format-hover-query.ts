export type FormatGroq = (query: string, width: number) => string | undefined

/**
 * Walks `query` from `from` past whitespace and `//` comments, and returns the index of the next
 * significant character.
 */
function skipTrivia(query: string, from: number): number {
  let i = from
  for (;;) {
    while (i < query.length && /\s/.test(query[i])) i++
    if (query.startsWith('//', i)) {
      const lineEnd = query.indexOf('\n', i)
      i = lineEnd === -1 ? query.length : lineEnd + 1
    } else {
      return i
    }
  }
}

/** Index just after the `;` that ends the custom function definition starting at `from`. */
function endOfFunction(query: string, from: number): number {
  let depth = 0
  for (let i = from; i < query.length; i++) {
    const char = query[i]
    if (char === '"' || char === "'") {
      i++
      while (i < query.length && query[i] !== char) {
        if (query[i] === '\\') i++
        i++
      }
    } else if (query.startsWith('//', i)) {
      const lineEnd = query.indexOf('\n', i)
      i = lineEnd === -1 ? query.length : lineEnd
    } else if (char === '(' || char === '[' || char === '{') {
      depth++
    } else if (char === ')' || char === ']' || char === '}') {
      depth--
    } else if (char === ';' && depth === 0) {
      return i + 1
    }
  }
  return -1
}

/**
 * Splits off what comes before the query itself: comments and the custom function definitions
 * (`fn name::fn($x) = ...;`) that groq-content-mapper prepends.
 */
export function splitPreamble(query: string): {preamble: string; body: string} {
  let end = 0
  for (;;) {
    const next = skipTrivia(query, end)
    if (!/^fn\s/.test(query.slice(next, next + 3))) {
      return {preamble: query.slice(0, next).trimEnd(), body: query.slice(next)}
    }
    const functionEnd = endOfFunction(query, next)
    if (functionEnd === -1) return {preamble: '', body: query}
    end = functionEnd
  }
}

/**
 * Lays a query out on real lines for display, wrapped to `width` columns. Custom function
 * definitions and leading comments are kept exactly as authored; only the query itself is
 * formatted. A query that cannot be parsed is returned as it is.
 */
export function formatQueryForHover(query: string, format: FormatGroq, width: number): string {
  const {preamble, body} = splitPreamble(query)
  let formatted: string | undefined
  try {
    formatted = format(body, width)
  } catch {
    formatted = undefined
  }
  if (formatted === undefined) return query
  return preamble ? `${preamble}\n\n${formatted}` : formatted
}
