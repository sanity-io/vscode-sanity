import {type CodeLensProvider, type TextDocument, type CancellationToken, CodeLens, Range, Position} from 'vscode'

interface ExtractedQuery {
  content: string
  uri: string
  position: Position
}

function extractAllTemplateLiterals(document: TextDocument): ExtractedQuery[] {
  const documents: ExtractedQuery[] = []
  const text = document.getText()
  const regExpGQL = new RegExp('groq\\s*`([\\s\\S]+?)`', 'mg')

  let prevIndex = 0
  let result
  while ((result = regExpGQL.exec(text)) !== null) {
    const content = result[1]
    const queryPosition = text.indexOf(content, prevIndex)
    documents.push({
      content: content,
      uri: document.uri.path,
      position: document.positionAt(queryPosition),
    })
    prevIndex = queryPosition + 1
  }
  return documents
}

function extractAllDefineQuery(document: TextDocument): ExtractedQuery[] {
  const documents: ExtractedQuery[] = []
  const text = document.getText()
  const pattern = '(\\s*defineQuery\\((["\'`])([\\s\\S]*?)\\2\\))'
  const regexp = new RegExp(pattern, 'g');

  let prevIndex = 0
  let result
  while ((result = regexp.exec(text)) !== null) {
    const content = result[3]
    const queryPosition = text.indexOf(result[1], prevIndex)
    documents.push({
      content: content,
      uri: document.uri.path,
      position: document.positionAt(queryPosition),
    })
    prevIndex = queryPosition + 1
  }
  return documents
}

export class GROQCodeLensProvider implements CodeLensProvider {
  constructor() {}

  public provideCodeLenses(document: TextDocument, _token: CancellationToken): CodeLens[] {
    if (document.languageId === 'groq') {
      return [
        new CodeLens(new Range(new Position(0, 0), new Position(0, 0)), {
          title: 'Execute Query',
          command: 'sanity.executeGroq',
          arguments: [document.getText()],
        }),
      ]
    }

    // find all lines where "groq" exists
    const queries: ExtractedQuery[] = [...extractAllTemplateLiterals(document), ...extractAllDefineQuery(document)]

    // add a button above each line that has groq
    return queries.map((def) => {
      return new CodeLens(
        new Range(new Position(def.position.line, 0), new Position(def.position.line, 0)),
        {
          title: 'Execute Query',
          command: 'sanity.executeGroq',
          arguments: [def.content],
        }
      )
    })
  }
}
