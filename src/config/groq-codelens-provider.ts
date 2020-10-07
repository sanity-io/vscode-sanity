import {CodeLensProvider, TextDocument, CancellationToken, CodeLens, Range, Position} from 'vscode'

import {ExtractedTemplateLiteral, extractAllTemplateLiterals} from './source-helper'

export class GROQCodeLensProvider implements CodeLensProvider {
  constructor() {}

  public provideCodeLenses(document: TextDocument, _token: CancellationToken): CodeLens[] {
    // find all lines where "groq" exists
    const literals: ExtractedTemplateLiteral[] = extractAllTemplateLiterals(document)

    // add a button above each line that has groq
    return literals.map((literal) => {
      return new CodeLens(
        new Range(
          new Position(literal.position.line + 1, 0),
          new Position(literal.position.line + 1, 0)
        ),
        {
          title: `Execute Query`,
          command: 'sanity.executeGroq',
          arguments: [literal.content],
        }
      )
    })
  }
}
