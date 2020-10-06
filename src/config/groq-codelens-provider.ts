import * as vscode from 'vscode'

import {ExtractedTemplateLiteral, extractAllTemplateLiterals} from './source-helper'

export class GROQCodeLensProvider implements vscode.CodeLensProvider {
  constructor() {}

  public provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    const literals: ExtractedTemplateLiteral[] = extractAllTemplateLiterals(document, ['groq'])
    return literals.map((literal) => {
      return new vscode.CodeLens(
        new vscode.Range(
          new vscode.Position(literal.position.line + 1, 0),
          new vscode.Position(literal.position.line + 1, 0)
        ),
        {
          title: `Execute Query`,
          command: 'extension.executeGroq',
          arguments: [literal],
        }
      )
    })
  }
}
