import * as path from 'path'
import * as vscode from 'vscode'
import {loadConfig} from './config/findConfig'

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand('extension.executeGroq', async () => {
    const activeFile = vscode.window.activeTextEditor?.document.fileName || ''
    const activeDir = path.dirname(activeFile)
    const config = await loadConfig(activeDir)
    if (!config) {
      vscode.window.showErrorMessage('Could not resolve sanity.json configuration file')
      return
    }

    vscode.window.showInformationMessage('Project ID is ' + config.projectId)
  })

  context.subscriptions.push(disposable)
}
