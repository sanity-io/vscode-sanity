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

interface ExtractedQuery {
  content: string
  /** Offset of `content` in the document. */
  start: number
  position: Position
  /** Only template literals can take the line breaks the formatter adds. */
  formattable: boolean
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
    const start = result.index + result[0].length - 2 - content.length
    documents.push({
      content,
      start,
      position: document.positionAt(result.index + result[0].indexOf('defineQuery')),
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

export class GROQCodeLensProvider implements CodeLensProvider, Disposable {
  private readonly changed = new EventEmitter<void>()
  private readonly configListener = workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('groq.enableFormatting')) {
      this.changed.fire()
    }
  })
  public readonly onDidChangeCodeLenses = this.changed.event

  public dispose(): void {
    this.configListener.dispose()
    this.changed.dispose()
  }

  public provideCodeLenses(document: TextDocument, _token: CancellationToken): Array<CodeLens> {
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

    // add a button above each line that has groq
    return queries.flatMap((def) => {
      const range = new Range(
        new Position(def.position.line, 0),
        new Position(def.position.line, 0),
      )
      const execute = new CodeLens(range, {
        title: 'Execute Query',
        command: 'sanity.executeGroq',
        arguments: [def.content],
      })
      return formatting && def.formattable ? [execute, formatLens(range, document, def)] : [execute]
    })
  }
}
