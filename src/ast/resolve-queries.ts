import {Project, SyntaxKind, type SourceFile} from 'ts-morph'
import * as path from 'path'
import * as vscode from 'vscode'
import {Position} from 'vscode'

const projectCache = new Map<string, Project>()

function getProjectForTsConfig(tsConfigPath: string): Project {
  let project = projectCache.get(tsConfigPath)
  if (!project) {
    project = new Project({
      tsConfigFilePath: tsConfigPath,
    })
    projectCache.set(tsConfigPath, project)
  }
  return project
}

function findNearestTsConfig(candidates: string[], currentPath: string): string {
  if (!candidates.length) {
    throw new Error('No tsconfig.json files found in workspace')
  }

  // Normalize the current path (we care about the directory the file is in)
  const currentDir = path.dirname(path.resolve(currentPath))

  let bestMatch: {file: string; dir: string} | undefined

  for (const candidate of candidates) {
    if (!candidate) continue
    const candidateFile = path.resolve(candidate)
    const candidateDir = path.dirname(candidateFile)

    // Ensure candidateDir is an ancestor (or same) of currentDir
    // Add path.sep to avoid partial segment matches (e.g. /apps/webX vs /apps/web)
    const withSep = candidateDir.endsWith(path.sep) ? candidateDir : candidateDir + path.sep
    if (currentDir === candidateDir || currentDir.startsWith(withSep)) {
      // Prefer the deepest (longest) candidateDir
      if (!bestMatch || candidateDir.length > bestMatch.dir.length) {
        bestMatch = {file: candidateFile, dir: candidateDir}
      }
    }
  }

  return bestMatch?.file ?? candidates[0]
}

interface Replacement {
  start: number
  end: number // exclusive
  text: string
}

function getDefineQueryCalls(source: SourceFile) {
  return source.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => {
    const callee = call.getExpression()
    return callee.getKind() === SyntaxKind.Identifier && callee.getText() === 'defineQuery'
  })
}

function getGroqTemplateLiterals(source: SourceFile) {
  return source.getDescendantsOfKind(SyntaxKind.TaggedTemplateExpression).filter((expression) => {
    const tag = expression.getTag()
    return tag.getKind() === SyntaxKind.Identifier && tag.getText() === 'groq'
  })
}

export async function resolveQueries(content: string, path: string) {
  const configUris = await vscode.workspace.findFiles('**/tsconfig.json', '**/node_modules/**')
  const candidates = configUris.map((u) => u.fsPath)
  const tsconfig = findNearestTsConfig(candidates, path)

  try {
    const project = getProjectForTsConfig(tsconfig)

    // Overwrite the current file in the project to ensure we have the latest
    // content.
    project.createSourceFile(path, content, {overwrite: true})

    const source = project.getSourceFileOrThrow(path)

    const positions: Position[] = []
    const replacements: Replacement[] = []

    // First pass - Evaluate all defineQuery calls and inline sub-queries
    ;[...getDefineQueryCalls(source), ...getGroqTemplateLiterals(source)].forEach((call) => {
      console.log('Position', call.getStartLineNumber(), call.getStartLinePos())
      positions.push(new Position(call.getStartLineNumber(), call.getStartLinePos()))

      // Find all `${...}` template spans inside the call
      // Note: It will match from ${ to the next ${ or end of block
      call.getDescendantsOfKind(SyntaxKind.TemplateSpan).forEach((span) => {
        // Grab the identifier inside ${...}
        const identifier = span.getFirstChildByKind(SyntaxKind.Identifier)

        // Look up the variable definition
        const definition = identifier?.getDefinitionNodes().at(0)

        // Get the source of the variable
        const subQuery =
          definition
            ?.getFirstDescendantByKind(SyntaxKind.NoSubstitutionTemplateLiteral)
            ?.getText()
            // Remove backticks
            .slice(1, -1) ?? ''

        // Get the identifier of the sub query, to get it's position in the source
        const subQueryIdentifier = span.getFirstDescendantByKindOrThrow(SyntaxKind.Identifier)

        if (!subQueryIdentifier) return

        // Include the surrounding ${ ... }
        const start = subQueryIdentifier.getStart() - 2 // `${`
        const end = subQueryIdentifier.getEnd() + 1 // `}`

        replacements.push({start, end, text: subQuery})
      })
    })

    // Apply replacements from last to first so earlier edits do not shift later ranges.
    replacements
      .sort((a, b) => b.start - a.start)
      .forEach((r) => {
        source?.replaceText([r.start, r.end], r.text)
      })

    // Second pass - Collect all queries (now with inlined sub-queries)
    const queries = [...getDefineQueryCalls(source), ...getGroqTemplateLiterals(source)]
      .map((call) => {
        const groq = call.getFirstDescendantByKind(SyntaxKind.NoSubstitutionTemplateLiteral)

        // Remove backticks
        return groq?.getText().slice(1, -1)
      })
      // Remove undefined results
      .filter((query) => typeof query === 'string')

    return queries.map((query, i) => {
      return {
        content: query,
        position: positions[i],
      }
    })
  } catch (err) {
    console.error('Failed to parse with ts-morph', err)
    return []
  }
}
