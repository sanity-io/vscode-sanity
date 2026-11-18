import {readFile} from 'node:fs/promises'
import {
  type CodeLensProvider,
  type TextDocument,
  type CancellationToken,
  type Disposable,
  CodeLens,
  EventEmitter,
  Range,
  Position,
  workspace,
} from 'vscode'
import {canFormatInSource} from '../format'
import {extractQueries} from '../fragments/resolve'
import type {FragmentHost} from '../fragments/types'

interface ExtractedQuery {
  content: string
  /** Offset of `content` in the document. */
  start: number
  /**
   * Offset of the `groq` tag or `defineQuery` call. Fragment resolution reports the same offset,
   * which is how an Execute lens is paired with the query it resolved.
   */
  anchor: number
  position: Position
  /** Only template literals can take the line breaks the formatter adds. */
  formattable: boolean
}

// Files read while resolving a query. Editing one has to refresh Execute Query on the files that
// imported it; the resolved text is captured when the lens is built.
const fragmentFiles = new Set<string>()

// Imported files are read from the editor first, so unsaved edits to a fragment are used too.
const fragmentHost: FragmentHost = {
  async readFile(file) {
    fragmentFiles.add(file)
    const open = workspace.textDocuments.find((document) => document.uri.fsPath === file)
    if (open) {
      return open.getText()
    }
    try {
      return await readFile(file, 'utf8')
    } catch {
      return undefined
    }
  },
}

function extractAllTemplateLiterals(document: TextDocument): Array<ExtractedQuery> {
  const documents: Array<ExtractedQuery> = []
  const text = document.getText()
  const regExpGQL = new RegExp('groq\\s*`([\\s\\S]+?)`', 'mg')

  let result
  while ((result = regExpGQL.exec(text)) !== null) {
    const content = result[1]
    const start = result.index + result[0].length - 1 - content.length
    documents.push({
      content,
      start,
      anchor: result.index,
      position: document.positionAt(start),
      formattable: canFormatInSource(content),
    })
  }
  return documents
}

function extractAllDefineQuery(document: TextDocument): Array<ExtractedQuery> {
  const documents: Array<ExtractedQuery> = []
  const text = document.getText()
  const pattern = '(\\s*defineQuery\\((["\'`])([\\s\\S]*?)\\2\\))'
  const regexp = new RegExp(pattern, 'g')

  let result
  while ((result = regexp.exec(text)) !== null) {
    const content = result[3]
    const anchor = result.index + result[0].indexOf('defineQuery')
    const start = result.index + result[0].length - 2 - content.length
    documents.push({
      content,
      start,
      anchor,
      position: document.positionAt(anchor),
      formattable: result[2] === '`' && canFormatInSource(content),
    })
  }
  return documents
}

function formatLens(range: Range, document: TextDocument, query: ExtractedQuery) {
  return new CodeLens(range, {
    title: 'Format Query',
    command: 'sanity.formatQuery',
    arguments: [document.uri, query.start, query.content],
  })
}

async function resolvedQueries(document: TextDocument): Promise<Map<number, string>> {
  const text = document.getText()
  if (!text.includes('groq') && !text.includes('defineQuery')) {
    return new Map()
  }
  const queries = await extractQueries(text, document.uri.fsPath, fragmentHost)
  return new Map(queries.map((query) => [query.offset, query.content]))
}

export class GROQCodeLensProvider implements CodeLensProvider, Disposable {
  private readonly changed = new EventEmitter<void>()
  private readonly configListener = workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('groq.enableFormatting')) {
      this.changed.fire()
    }
  })
  private readonly fragmentListener = workspace.onDidChangeTextDocument((event) => {
    if (event.contentChanges.length > 0 && fragmentFiles.has(event.document.uri.fsPath)) {
      this.changed.fire()
    }
  })
  private readonly fragmentSaveListener = workspace.onDidSaveTextDocument((document) => {
    if (fragmentFiles.has(document.uri.fsPath)) {
      this.changed.fire()
    }
  })
  public readonly onDidChangeCodeLenses = this.changed.event

  public dispose(): void {
    this.configListener.dispose()
    this.fragmentListener.dispose()
    this.fragmentSaveListener.dispose()
    this.changed.dispose()
  }

  public async provideCodeLenses(
    document: TextDocument,
    _token: CancellationToken,
  ): Promise<Array<CodeLens>> {
    const formatting = workspace.getConfiguration('groq').get<boolean>('enableFormatting', true)

    if (document.languageId === 'groq') {
      const range = new Range(new Position(0, 0), new Position(0, 0))
      const content = document.getText()
      return [
        new CodeLens(range, {
          title: 'Execute Query',
          command: 'sanity.executeGroq',
          arguments: [content],
        }),
        ...(formatting && content.trim()
          ? [
              formatLens(range, document, {
                content,
                start: 0,
                anchor: 0,
                position: range.start,
                formattable: true,
              }),
            ]
          : []),
      ]
    }

    // find all lines where "groq" exists
    const queries: Array<ExtractedQuery> = [
      ...extractAllTemplateLiterals(document),
      ...extractAllDefineQuery(document),
    ]
    const resolved = await resolvedQueries(document)

    // add a button above each line that has groq
    return queries.flatMap((def) => {
      const range = new Range(
        new Position(def.position.line, 0),
        new Position(def.position.line, 0),
      )
      const execute = new CodeLens(range, {
        title: 'Execute Query',
        command: 'sanity.executeGroq',
        // A query the resolver does not see keeps the text it had, which is what ran before.
        arguments: [resolved.get(def.anchor) ?? def.content],
      })
      return formatting && def.formattable ? [execute, formatLens(range, document, def)] : [execute]
    })
  }
}
