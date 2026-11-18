export interface FragmentHost {
  /** The text of a file, or undefined when it does not exist or is not a file. */
  readFile(path: string): Promise<string | undefined>
}

export interface ExtractedQuery {
  /** The query with every `${}` that could be resolved replaced by its text. */
  content: string
  /** Offset in the source where the `groq` tag or `defineQuery` call starts. */
  offset: number
}
