export interface GroqImportSpecifier {
  specifier: string
  /** Offset of the first character of the specifier, inside the quotes. */
  start: number
  /** Offset just after the last character of the specifier. */
  end: number
}

// `from '…'` covers imports and re-exports, the rest are side effect imports, `import('…')` and
// `require('…')`. Only string literals in those positions count, so prose in a comment or an
// apostrophe does not pair up into a fake specifier.
const GROQ_SPECIFIER = /\b(?:from\s*|import\s*\(?\s*|require\s*\(\s*)(['"])([^'"\r\n]+\.groq)\1/g

/** Every module specifier in a JavaScript or TypeScript source that ends in `.groq`. */
export function findGroqSpecifiers(source: string): Array<GroqImportSpecifier> {
  const found: Array<GroqImportSpecifier> = []
  for (const match of source.matchAll(GROQ_SPECIFIER)) {
    const specifier = match[2]
    const start = match.index + match[0].length - 1 - specifier.length
    found.push({specifier, start, end: start + specifier.length})
  }
  return found
}
