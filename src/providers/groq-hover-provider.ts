import * as vscode from 'vscode'
import {formatGroq} from '../format'
import {findGroqInHoverMarkdown} from '../hover/groq-in-hover'

export const HOVER_LANGUAGES = ['typescript', 'typescriptreact', 'javascript', 'javascriptreact']

type HoverContent = vscode.Hover['contents'][number]

function markdownOf(content: HoverContent): string {
  if (typeof content === 'string') return content
  if ('language' in content) return '```' + content.language + '\n' + content.value + '\n```'
  return content.value
}

function fenceFor(code: string) {
  const longestRun = Math.max(2, ...(code.match(/`+/g) ?? []).map((run) => run.length))
  return '`'.repeat(longestRun + 1)
}

/**
 * Adds a formatted, syntax-highlighted copy of any GROQ query found in the hover shown by the
 * language server for the same position. TypeScript prints `.groq` import types as a one line
 * string with `\n` escapes, which VS Code cannot reflow itself.
 */
export class GroqHoverProvider implements vscode.HoverProvider {
  private readonly inFlight = new Set<string>()

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | undefined> {
    if (!vscode.workspace.getConfiguration('sanity').get('formatGroqInHover', true))
      return undefined

    // `executeHoverProvider` asks every provider, including this one.
    const key = `${document.uri.toString()}:${document.version}:${position.line}:${
      position.character
    }`
    if (this.inFlight.has(key)) return undefined

    this.inFlight.add(key)
    let hovers: vscode.Hover[] | undefined
    try {
      hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        document.uri,
        position
      )
    } finally {
      this.inFlight.delete(key)
    }
    if (!hovers || token.isCancellationRequested) return undefined

    const seen = new Set<string>()
    const blocks: string[] = []
    for (const hover of hovers) {
      for (const content of hover.contents) {
        for (const {query} of findGroqInHoverMarkdown(markdownOf(content))) {
          if (seen.has(query)) continue
          seen.add(query)
          const formatted = (await formatGroq(query).catch(() => undefined)) ?? query
          const fence = fenceFor(formatted)
          blocks.push(`${fence}groq\n${formatted}\n${fence}`)
        }
      }
    }
    if (blocks.length === 0 || token.isCancellationRequested) return undefined

    return new vscode.Hover(new vscode.MarkdownString(blocks.join('\n\n')))
  }
}
