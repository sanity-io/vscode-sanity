import {Position, TextDocument} from 'vscode'

export interface ExtractedTemplateLiteral {
  content: string
  uri: string
  position: Position
}

export function extractAllTemplateLiterals(
  document: TextDocument,
  tags: string[] = ['groq']
): ExtractedTemplateLiteral[] {
  console.log('document', document)
  const text = document.getText()
  const documents: ExtractedTemplateLiteral[] = []

  tags.forEach((tag) => {
    // https://regex101.com/r/Pd5PaU/2
    const regExpGQL = new RegExp(tag + '\\s*`([\\s\\S]+?)`', 'mg')

    let result
    while ((result = regExpGQL.exec(text)) !== null) {
      const contents = result[1]

      // https://regex101.com/r/KFMXFg/2
      if (Boolean(contents.match('/${(.+)?}/g'))) {
        // We are ignoring operations with template variables for now
        continue
      }
      try {
        processGroqString(contents, result.index + 4)
      } catch (e) {}
    }
  })
  return documents

  function processGroqString(text: string, offset: number) {
    console.log(text)
    //   try {
    //     const ast = parse(text)
    //     const operations = ast.definitions.filter((def) => def.kind === 'OperationDefinition')
    //     operations.forEach((op: any) => {
    //       const filteredAst = {
    //         ...ast,
    //         definitions: ast.definitions.filter((def) => {
    //           if (def.kind === 'OperationDefinition' && def !== op) {
    //             return false
    //           }
    //           return true
    //         }),
    //       }
    //       const content = print(filteredAst)
    //       documents.push({
    //         content: content,
    //         uri: document.uri.path,
    //         position: document.positionAt(op.loc.start + offset),
    //         definition: op,
    //         ast: filteredAst,
    //       })
    //     })
    //   } catch (e) {}
  }
}
