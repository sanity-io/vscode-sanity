import {CodeLensProvider, TextDocument, CancellationToken, CodeLens, Range, Position} from 'vscode'

interface ExtractedTemplateLiteral {
  content: string
  uri: string
  position: Position
}

function extractAllTemplateLiterals(document: TextDocument): ExtractedTemplateLiteral[] {
  const documents: ExtractedTemplateLiteral[] = []
  const text = document.getText()
  const regExpGQL = new RegExp('groq\\s*`([\\s\\S]+?)`', 'mg')

  let result
  while ((result = regExpGQL.exec(text)) !== null) {
    const content = result[1]
    documents.push({
      content: content,
      uri: document.uri.path,
      position: document.positionAt(text.indexOf(content)),
    })
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
    const literals: ExtractedTemplateLiteral[] = extractAllTemplateLiterals(document)

    // add a button above each line that has groq
    return literals.map((literal) => {
      return new CodeLens(
        new Range(new Position(literal.position.line, 0), new Position(literal.position.line, 0)),
        {
          title: 'Execute Query',
          command: 'sanity.executeGroq',
          arguments: [literal.content],
        }
      )
    })
  }
}
