import {Position, TextDocument} from 'vscode'

export interface ExtractedTemplateLiteral {
  content: string
  uri: string
  position: Position
}

export function extractAllTemplateLiterals(document: TextDocument): ExtractedTemplateLiteral[] {
  const documents: ExtractedTemplateLiteral[] = []
  const text = document.getText()
  const regExpGQL = new RegExp('\\s*groq`([\\s\\S]+?)`', 'mg')

  let result
  while ((result = regExpGQL.exec(text)) !== null) {
    const content = result[1]
    documents.push({
      content: content,
      uri: document.uri.path,
      position: document.positionAt(text.indexOf(content) + content.length),
    })
  }
  return documents
}
