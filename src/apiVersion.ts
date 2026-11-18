export const DEFAULT_API_VERSION = 'v2025-02-19'

// Keep in sync with the `pattern` of `sanity.apiVersion` in package.json.
const API_VERSION_PATTERN = /^v?(?:\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])|1|X)$/

export interface ResolvedApiVersion {
  apiVersion: string
  /** Set when `value` was not usable and the default is returned instead. */
  invalid?: string
}

export function resolveApiVersion(value: unknown): ResolvedApiVersion {
  if (value === undefined || value === null || value === '') {
    return {apiVersion: DEFAULT_API_VERSION}
  }

  if (typeof value === 'string' && API_VERSION_PATTERN.test(value.trim())) {
    return {apiVersion: value.trim()}
  }

  return {apiVersion: DEFAULT_API_VERSION, invalid: String(value)}
}
