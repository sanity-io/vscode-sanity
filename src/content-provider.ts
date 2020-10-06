import * as vscode from 'vscode'

// Shamelessly ripped from Stack Overflow
function syntaxHighlight(json) {
  if (typeof json != 'string') {
    json = JSON.stringify(json, undefined, 2)
  }
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    function (match) {
      var cls = 'number'
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'key'
        } else {
          cls = 'string'
        }
      } else if (/true|false/.test(match)) {
        cls = 'boolean'
      } else if (/null/.test(match)) {
        cls = 'null'
      }
      return '<span class="' + cls + '">' + match + '</span>'
    }
  )
}

export class GroqContentProvider implements vscode.TextDocumentContentProvider {
  private html: string = ''
  // pre {outline: 1px solid #ccc; padding: 5px; margin: 5px; }
  private css: string = `
.string { color: #16ae3c; }
.number { color: #fc736a; }
.boolean { color: #145eda; }
.null { color: #a935f0; }
.key { color: #bb5d0a; }
`

  constructor(data: any) {
    this.html = `<html>
<head>
    <style>
    ${this.css}
    </style
</head>
<body><pre>${syntaxHighlight(data)}</pre></body></html>
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
}
