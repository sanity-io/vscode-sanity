import * as vscode from 'vscode'

export class GroqContentProvider implements vscode.TextDocumentContentProvider {
  private html: string = ''

  constructor(data: any) {
    this.html = `<html><body><pre>${JSON.stringify(data, null, 2)}</pre></body></html>`
  }

  provideTextDocumentContent(_: vscode.Uri): vscode.ProviderResult<string> {
    return this.html
  }

  getCurrentHTML(): Promise<string> {
    return new Promise((resolve) => {
      resolve(this.html)
    })
  }
}
