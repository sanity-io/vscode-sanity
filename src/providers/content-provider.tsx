import React from 'react'
import ReactDOM from 'react-dom/server'
import {type TextDocumentContentProvider, type Uri, type ProviderResult} from 'vscode'
import {ResultView} from '../resultView/ResultView'

export class GroqContentProvider implements TextDocumentContentProvider {
  private html: string = ''

  constructor(query: string, params: Record<string, unknown>, ms: number, data: any) {
    this.html = `
    <html>
      <head>
        <title>GROQ result</title>
        <style>
          html, body, h1 {margin: 0; padding: 0;}
          body {padding: 10px;}
        </style>
      </head>
      <body>${this.render(query, params, ms, data)}</body>
    </html>
`
  }

  provideTextDocumentContent(_: Uri): ProviderResult<string> {
    return this.html
  }

  getCurrentHTML(): Promise<string> {
    return new Promise((resolve) => {
      resolve(this.html)
    })
  }

  render(query: string, params: Record<string, unknown>, ms: number, result: any) {
    return ReactDOM.renderToStaticMarkup(
      <>
        <ResultView query={query} params={params} ms={ms} result={result} />
      </>
    )
  }
}
