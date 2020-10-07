import {CodeLensProvider, TextDocument, CancellationToken, CodeLens, Range, Position} from 'vscode'
import lineNumber from 'line-number'

export class GROQCodeLensProvider implements CodeLensProvider {
  constructor() {}

  public provideCodeLenses(document: TextDocument, _token: CancellationToken): CodeLens[] {
    // find all lines where "groq" exists
    const documentText = document.getText()
    let lines = lineNumber(documentText, /groq/g)
    lines.shift() // remove the first one because its the import groq from 'groq'

    // find content here
    // TODO: handle multiple groqs. this only does the first one
    // const regexGroq = new RegExp('groq\\s*`([\\s\\S]+?)`', 'mg')

    // let result
    // let contents
    // if ((result = regexGroq.exec(documentText)) !== null) {
    //   contents = result[1]
    // }

    // add a button above each line that has groq
    return lines.map((line) => {
      return new CodeLens(
        new Range(new Position(line.number - 1, 0), new Position(line.number - 1, 0)),
        {
          title: `Execute Query`,
          command: 'extension.executeGroq',
          arguments: [],
        }
      )
    })
  }
}
