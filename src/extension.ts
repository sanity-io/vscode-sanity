import * as path from 'path'
import * as vscode from 'vscode'
import {promises as fs, constants as fsconstants} from 'fs'
import {parse} from 'groq-js'
import {loadConfig} from './config/findConfig'
import {executeGroq, executeGroqWithParams} from './query'
import {GroqContentProvider} from './providers/content-provider'
import {GROQCodeLensProvider} from './providers/groq-codelens-provider'

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

  if (settings.codelens) {
    registerCodeLens()
  }

  let resultPanel: vscode.WebviewPanel | undefined
  let disposable = vscode.commands.registerCommand('sanity.executeGroq', async (groqQuery) => {
    let files
    try {
      files = await readRequiredFiles(false)
    } catch (err) {
      vscode.window.showErrorMessage(err.message)
      return
    }

    const query = groqQuery || files.groq
    const variables = findVariablesInQuery(query)
    if (variables.length > 0) {
      console.log('variables found:', variables)
      // @todo fire up the other command?
    }

    // FIXME: Throw error object in webview?
    let queryResult
    try {
      let useCDN = vscode.workspace.getConfiguration('vscode-sanity').get('useCDN', true)
      const {ms, result} = await executeGroq(
        files.config.projectId,
        files.config.dataset,
        query,
        useCDN
      )
      queryResult = result
      vscode.window.setStatusBarMessage(
        `Query took ${ms}ms` + (useCDN ? ' with cdn' : ' without cdn'),
        10000
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

      resultPanel.onDidDispose(() => {
        resultPanel = undefined
      })
    }

    const contentProvider = await registerContentProvider(context, queryResult || [])
    const html = await contentProvider.getCurrentHTML()
    resultPanel.webview.html = html
  })
  context.subscriptions.push(disposable)

  disposable = vscode.commands.registerCommand('sanity.executeGroqWithParams', async (args) => {
    let files
    try {
      files = await readRequiredFiles(true)
    } catch (err) {
      vscode.window.showErrorMessage(err.message)
      return
    }

    // FIXME: Throw error object in webview?
    let queryResult
    try {
      let useCDN = vscode.workspace.getConfiguration('vscode-sanity').get('useCDN', true)
      const {ms, result} = await executeGroqWithParams(
        files.config.projectId,
        files.config.dataset,
        files.groq,
        files.params,
        useCDN
      )
      queryResult = result
      vscode.window.setStatusBarMessage(
        `Query took ${ms}ms` + (useCDN ? ' with cdn' : ' without cdn'),
        10000
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

      resultPanel.onDidDispose(() => {
        resultPanel = undefined
      })
    }

    const contentProvider = await registerContentProvider(context, queryResult || [])
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
    let defaultParamFile
    const activeFile = getActiveFileName()
    if (activeFile && activeFile !== '') {
      let f = activeFile.replace('.groq', '.json')
      if (await checkFileExists(f)) {
        defaultParamFile = path.basename(f)
      }
    }
    const paramsFile = await vscode.window.showInputBox({value: defaultParamFile})
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

  const activeFile = getActiveFileName()
  const activeDir = path.dirname(activeFile)
  return activeDir
}

function getActiveFileName(): string {
  return vscode.window.activeTextEditor?.document.fileName || ''
}

async function checkFileExists(file) {
  return fs
    .access(file, fsconstants.F_OK)
    .then(() => true)
    .catch(() => false)
}

function findVariablesInQuery(query: string): string[] {
  return findVariables(parse(query), [])
}

function findVariables(node: any, found: string[]): string[] {
  if (node && node.type === 'Parameter' && typeof node.name === 'string') {
    return found.concat(node.name)
  }

  if (Array.isArray(node)) {
    return node.reduce((acc, child) => findVariables(child, acc), found)
  }

  if (typeof node !== 'object') {
    return found
  }

  return Object.keys(node).reduce((acc, key) => findVariables(node[key], acc), found)
}
