import {ContentMapperConfigs, withGroqFunctions} from '@sanity-labs/groq-lsp/functions'

const configs = new ContentMapperConfigs()

/**
 * `query` with the definitions of the custom GROQ functions it calls prepended, and of those they
 * call in turn, so it runs on its own. The functions are those of groq-content-mapper's
 * `functions` option in the tsconfig.json nearest `file`, read from disk.
 */
export function withCustomFunctions(query: string, file: string | undefined): string {
  const functions = file ? configs.forFile(file)?.functions?.functions : undefined
  return functions ? withGroqFunctions(query, functions) : query
}

/**
 * Reads groq-content-mapper's settings and functions files again on next use. The cache only
 * notices changes to a tsconfig.json or functions file it already read, not a new tsconfig.json
 * nearer a file or a new file that a `functions` glob matches.
 */
export function invalidateCustomFunctions(): void {
  configs.invalidate()
}
