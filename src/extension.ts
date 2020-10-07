import * as path from 'path'
import * as vscode from 'vscode'
import {promises as fs, constants as fsconstants} from 'fs'
import {parse} from 'groq-js'
import {loadConfig} from './config/findConfig'
import {executeGroq} from './query'
import {GroqContentProvider} from './providers/content-provider'
import {GROQCodeLensProvider} from './providers/groq-codelens-provider'

export function activate(context: vscode.ExtensionContext) {
  const settings = vscode.workspace.getConfiguration('vscode-sanity')

  if (settings.codelens) {
    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(
        ['javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'groq'],
        new GROQCodeLensProvider()
      )
    )
  }

  let resultPanel: vscode.WebviewPanel | undefined
  let disposable = vscode.commands.registerCommand('sanity.executeGroq', async (groqQuery) => {
    let openJSONFile = settings.get('openJSONFile')
    let config: config
    let query: string = groqQuery
    let params: string = '{}'
    try {
      config = await loadSanityJson()
      if (!query) {
        query = await loadGroqFromFile()
      }
      const variables = findVariablesInQuery(query)
      if (variables.length > 0) {
        console.log('variables found:', variables)
        params = await readParamsFile()
      }

      // FIXME: Throw error object in webview?
      let useCDN = settings.get('useCDN', true)

      const {ms, result} = await executeGroq(
        config.projectId,
        config.dataset,
        query,
        params,
        useCDN
      )
      vscode.window.setStatusBarMessage(
        `Query took ${ms}ms` + (useCDN ? ' with cdn' : ' without cdn'),
        10000
      )

      if (!openJSONFile && !resultPanel) {
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

      if (!openJSONFile && resultPanel) {
        const contentProvider = await registerContentProvider(context, result || [])
        const html = await contentProvider.getCurrentHTML()
        resultPanel.webview.html = html
      } else {
        vscode.window.setStatusBarMessage(`result=${result}`)
        await openInUntitled(result, 'json')
      }
    } catch (err) {
      vscode.window.showErrorMessage(err.message)
      return
    }
  })
  context.subscriptions.push(disposable)
}

type config = {
  projectId: string
  dataset: string
}

async function loadSanityJson() {
  const activeDir = getRootPath()
  const config = await loadConfig(activeDir)
  if (!config) {
    throw new Error('Could not resolve sanity.json configuration file')
  }
  return config
}

async function loadGroqFromFile() {
  const activeTextEditor = vscode.window.activeTextEditor
  if (!activeTextEditor) {
    throw new Error('Nothing to execute')
  }

  return activeTextEditor.document.getText()
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

async function readParamsFile(): Promise<string> {
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
  const activeDir = getRootPath()
  return await fs.readFile(activeDir + '/' + paramsFile, 'utf8')
}

async function openInUntitled(content: string, language?: string) {
  const cs = JSON.stringify(content)
  await vscode.workspace.openTextDocument({content: cs}).then((document) => {
    vscode.window.showTextDocument(document)
    vscode.languages.setTextDocumentLanguage(document, language || 'json')
  })
}
