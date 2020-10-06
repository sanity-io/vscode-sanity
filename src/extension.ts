import * as path from 'path'
import * as vscode from 'vscode'
import {loadConfig} from './config/findConfig'
import {executeGroq} from './query'
import {GroqContentProvider} from './content-provider'

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand('extension.executeGroq', async () => {
    const activeTextEditor = vscode.window.activeTextEditor
    if (!activeTextEditor) {
      vscode.window.showErrorMessage('Nothing to execute')
      return
    }

    const activeFile = activeTextEditor.document.fileName || ''
    const activeDir = path.dirname(activeFile)
    const config = await loadConfig(activeDir)
    if (!config) {
      vscode.window.showErrorMessage('Could not resolve sanity.json configuration file')
      return
    }
    vscode.window.showInformationMessage(
      `Using projectId "${config.projectId}" and dataset "${config.dataset}"`
    )

    const content = activeTextEditor.document.getText()
    const result = await executeGroq(config.projectId, config.dataset, content)
    const panel = vscode.window.createWebviewPanel(
      'executionResultsWebView',
      'GROQ Execution Result',
      vscode.ViewColumn.Two,
      {}
    )
    const contentProvider = new GroqContentProvider(result)
    const registration = vscode.workspace.registerTextDocumentContentProvider(
      'groq',
      contentProvider
    )
    context.subscriptions.push(registration)

    const html = await contentProvider.getCurrentHTML()
    panel.webview.html = html
  })

  context.subscriptions.push(disposable)
}

// async function openInUntitled(content: string, language?: string) {
//   const document = await vscode.workspace.openTextDocument({
//     language,
//     content,
//   })
//   vscode.window.showTextDocument(document)
// }
