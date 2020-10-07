import * as path from 'path'
import * as vscode from 'vscode'
import {loadConfig} from './config/findConfig'
import {promises as fs} from 'fs'
import {executeGroq, executeGroqWithParams} from './query'
import {GroqContentProvider} from './content-provider'
import {GROQCodeLensProvider} from './config/groq-codelens-provider'

export function activate(context: vscode.ExtensionContext) {
  const settings = vscode.workspace.getConfiguration('vscode-sanity')

  const registerCodeLens = () => {
    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(
        ['javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'groq'],
        new GROQCodeLensProvider()
      )
    )
  }

  if (true || settings.showExecCodelens) {
    registerCodeLens()
  }

  let activePanel
  let disposable = vscode.commands.registerCommand('extension.executeGroq', async () => {
    let files
    try {
      files = await readRequiredFiles(false)
    } catch (err) {
      vscode.window.showErrorMessage(err.message)
      return
    }

    vscode.window.showInformationMessage(
      `Using projectId "${files.config.projectId}" and dataset "${files.config.dataset}"`
    )

    // FIXME: Throw error object in webview?
    let result
    try {
      result = await executeGroq(files.config.projectId, files.config.dataset, files.groq)
    } catch (err) {
      vscode.window.showErrorMessage(err)
      return
    }

    if (!activePanel) {
      activePanel = vscode.window.createWebviewPanel(
        'executionResultsWebView',
        'GROQ Execution Result',
        vscode.ViewColumn.Beside,
        {}
      )
    }

    const contentProvider = await registereContentProvider(context, result)
    const html = await contentProvider.getCurrentHTML()
    activePanel.webview.html = html
  })
  context.subscriptions.push(disposable)

  disposable = vscode.commands.registerCommand('extension.executeGroqWithParams', async () => {
    let files
    try {
      files = await readRequiredFiles(true)
    } catch (err) {
      vscode.window.showErrorMessage(err.message)
      return
    }

    vscode.window.showInformationMessage(
      `Using projectId "${files.config.projectId}" and dataset "${files.config.dataset}"`
    )

    // FIXME: Throw error object in webview?
    let result
    try {
      result = await executeGroqWithParams(files.config.projectId, files.config.dataset, files.groq, files.params)
    } catch (err) {
      vscode.window.showErrorMessage(err)
      return
    }

    if (!activePanel) {
      activePanel = vscode.window.createWebviewPanel(
        'executionResultsWebView',
        'GROQ Execution Result',
        vscode.ViewColumn.Beside,
        {}
      )
    }

    const contentProvider = await registereContentProvider(context, result)
    const html = await contentProvider.getCurrentHTML()
    activePanel.webview.html = html
  })
  context.subscriptions.push(disposable)
}

type config = {
  projectId: string
  dataset: string
}

type RequiredFiles = {
  config: config
  groq: string
  params: string
}

async function readRequiredFiles(askParamsFile: boolean): Promise<RequiredFiles> {
  let files = <RequiredFiles>{}
  const activeFile = vscode.window.activeTextEditor?.document.fileName || ''
  const activeDir = path.dirname(activeFile)
  files.config = await loadConfig(activeDir)
  if (!files.config) {
    throw new Error('Could not resolve sanity.json configuration file')
  }

  const activeTextEditor = vscode.window.activeTextEditor
  if (!activeTextEditor) {
    throw new Error('Nothing to execute')
  }

  files.groq = activeTextEditor.document.getText()
  if (askParamsFile) {
    const paramsFile = await vscode.window.showInputBox()
    if (!paramsFile) {
      throw new Error('Invalid param file received')
    }
    files.params = await fs.readFile(activeDir + '/' + paramsFile, 'utf8')
  }
  return files
}

async function registereContentProvider(
  context: vscode.ExtensionContext,
  result: any
): Promise<any> {
  const contentProvider = new GroqContentProvider(result)
  const registration = vscode.workspace.registerTextDocumentContentProvider('groq', contentProvider)
  context.subscriptions.push(registration)
  return contentProvider
}
