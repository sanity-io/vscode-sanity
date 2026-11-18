import path from 'node:path'
import {pathCandidates, readPathMapping} from '../fragments/resolve-import'
import type {FragmentHost} from '../fragments/types'

export interface GroqImportHost extends FragmentHost {
  directoryExists(dir: string): Promise<boolean>
}

export interface ResolvedGroqImport {
  file: string
  /** False when nothing is there yet: `file` is where the import would point to. */
  exists: boolean
}

/**
 * Finds the `.groq` file an import specifier points to: relative paths, plus the `paths` and
 * `baseUrl` of the nearest tsconfig.json or jsconfig.json. When several mappings match, the first
 * one that exists wins. When none does, the best candidate is returned so the file can be created:
 * the one whose folder exists, otherwise the first one. Packages are not followed.
 */
export async function resolveGroqImport(
  fromFile: string,
  specifier: string,
  host: GroqImportHost,
): Promise<ResolvedGroqImport | undefined> {
  const candidates = await candidatesOf(fromFile, specifier, host)
  const unique = [...new Set(candidates)]

  for (const file of unique) {
    if ((await host.readFile(file)) !== undefined) {
      return {file, exists: true}
    }
  }
  for (const file of unique) {
    if (await host.directoryExists(path.dirname(file))) {
      return {file, exists: false}
    }
  }
  return unique[0] === undefined ? undefined : {file: unique[0], exists: false}
}

async function candidatesOf(
  fromFile: string,
  specifier: string,
  host: GroqImportHost,
): Promise<Array<string>> {
  if (specifier.startsWith('.')) {
    return [path.resolve(path.dirname(fromFile), specifier)]
  }
  if (path.isAbsolute(specifier)) {
    return []
  }
  const mapping = await readPathMapping(fromFile, host)
  if (!mapping) {
    return []
  }
  const candidates = pathCandidates(specifier, mapping)
  if (mapping.hasBaseUrl) {
    candidates.push(path.resolve(mapping.base, specifier))
  }
  return candidates
}
