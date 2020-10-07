import React from 'react'
import ReactDOM from 'react-dom/server'
import * as vscode from 'vscode'
import {ResultView} from '../resultView/ResultView'

export class GroqContentProvider implements vscode.TextDocumentContentProvider {
  private html: string = ''

  constructor(data: any) {
    this.html = `
    <html>
      <head>
        <title>GROQ result</title>
        <style>
          html, body, h1 {margin: 0; padding: 0;}
          body {padding: 10px;}
        </style>
      </head>
      <body>${this.render(data)}</body>
    </html>
`
  }

  provideTextDocumentContent(_: vscode.Uri): vscode.ProviderResult<string> {
    return this.html
  }

  getCurrentHTML(): Promise<string> {
    return new Promise((resolve) => {
      resolve(this.html)
    })
  }

  render(result: any) {
    return ReactDOM.renderToStaticMarkup(
      <>
        <ResultView result={result} />
      </>
    )
  }
}
