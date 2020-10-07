import * as path from 'path'
import * as vscode from 'vscode'
import {loadConfig} from './config/findConfig'
import {promises as fs} from 'fs'
import {executeGroq, executeGroqWithParams} from './query'
import {GroqContentProvider} from './content-provider'
import {GROQCodeLensProvider} from './config/groq-codelens-provider'

export function activate(context: vscode.ExtensionContext) {
  const settings = vscode.workspace.getConfiguration('vscode-sanity')
  console.log(JSON.stringify(settings, null, 2))

  const registerCodeLens = () => {
    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(
        ['javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'groq'],
        new GROQCodeLensProvider()
      )
    )
  }

  if (settings.codelens) {
    registerCodeLens()
  }

  let resultPanel
  let disposable = vscode.commands.registerCommand('sanity.executeGroq', async (groqQuery) => {
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
    let queryResult
    try {
      const {ms, result} = await executeGroq(
        files.config.projectId,
        files.config.dataset,
        groqQuery || files.groq
      )
      queryResult = result
      vscode.window.setStatusBarMessage(`Query took ${ms}ms`, 10000)
    } catch (err) {
      vscode.window.showErrorMessage(err)
      return
    }

    if (!resultPanel) {
      resultPanel = vscode.window.createWebviewPanel(
        'executionResultsWebView',
        'GROQ Execution Result',
        vscode.ViewColumn.Beside,
        {}
      )
    }

    const contentProvider = await registerContentProvider(context, queryResult || [])
    const html = await contentProvider.getCurrentHTML()
    resultPanel.webview.html = html
  })
  context.subscriptions.push(disposable)

  disposable = vscode.commands.registerCommand('sanity.executeGroqWithParams', async (args) => {
    console.log(args)
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
      result = await executeGroqWithParams(
        files.config.projectId,
        files.config.dataset,
        files.groq,
        files.params
      )
    } catch (err) {
      vscode.window.showErrorMessage(err)
      return
    }

    if (!resultPanel) {
      resultPanel = vscode.window.createWebviewPanel(
        'executionResultsWebView',
        'GROQ Execution Result',
        vscode.ViewColumn.Beside,
        {}
      )
    }

    const contentProvider = await registerContentProvider(context, result)
    const html = await contentProvider.getCurrentHTML()
    resultPanel.webview.html = html
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
  const activeDir = getRootPath()

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

async function registerContentProvider(
  context: vscode.ExtensionContext,
  result: any
): Promise<any> {
  const contentProvider = new GroqContentProvider(result)
  const registration = vscode.workspace.registerTextDocumentContentProvider('groq', contentProvider)
  context.subscriptions.push(registration)
  return contentProvider
}

function getRootPath(): string {
  const folders = vscode.workspace.workspaceFolders || []
  if (folders.length > 0) {
    return folders[0].uri.fsPath
  }

  const activeFile = vscode.window.activeTextEditor?.document.fileName || ''
  const activeDir = path.dirname(activeFile)
  return activeDir
}
