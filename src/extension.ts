import fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import {loadConfig} from './config/findConfig'
import {executeGroq} from './query'

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand('extension.executeGroq', async () => {
    const activeFile = vscode.window.activeTextEditor?.document.fileName || ''
    const activeDir = path.dirname(activeFile)
    const config = await loadConfig(activeDir)
    if (!config) {
      vscode.window.showErrorMessage('Could not resolve sanity.json configuration file')
      return
    }
    const file = fs.readFileSync(activeFile, 'utf8')
    const result = await executeGroq(config.projectId, config.dataset, file)
    vscode.window.showInformationMessage(
      `Using projectId "${config.projectId}" and dataset "${config.dataset}"`
    )
    openInUntitled(result, 'json')
  })

  context.subscriptions.push(disposable)
}

async function openInUntitled(content: string, language?: string) {
  const document = await vscode.workspace.openTextDocument({
    language,
    content,
  })
  vscode.window.showTextDocument(document)
}
