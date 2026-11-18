/**
 * Languages whose files can contain GROQ in tagged templates or `defineQuery()` calls. `astro` is the
 * language id the Astro extension gives `.astro` files. Every id here needs an `onLanguage`
 * activation event in package.json, or the extension stays inactive when only such a file is open.
 */
export const EMBEDDED_GROQ_LANGUAGES = [
  'javascript',
  'javascriptreact',
  'typescript',
  'typescriptreact',
  'astro',
]
