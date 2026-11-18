// Keys are the parameter names in the query. Values are JSON the user typed.
// oxlint-disable-next-line quality/no-unsafe-dictionary-type -- open JSON object, not a schema
export type QueryParams = Record<string, unknown>
