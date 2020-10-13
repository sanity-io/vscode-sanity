import * as path from 'path'
import * as vscode from 'vscode'
import {promises as fs, constants as fsconstants} from 'fs'
import {parse} from 'groq-js'
import {Config, loadConfig} from './config/findConfig'
import {GroqContentProvider} from './providers/content-provider'
import {GROQCodeLensProvider} from './providers/groq-codelens-provider'
import {executeGroq} from './query'

export function activate(context: vscode.ExtensionContext) {
  // Assigned by `readConfig()`
  let codelens: vscode.Disposable | undefined
  let useCodelens
  let openJSONFile
  let useCDN

  // Read and listen for configuration updates
  readConfig()
  vscode.workspace.onDidChangeConfiguration(() => readConfig())

  let resultPanel: vscode.WebviewPanel | undefined
  let disposable = vscode.commands.registerCommand('sanity.executeGroq', async (groqQuery) => {
    let config: Config
    let query: string = groqQuery
    let params = {}
    try {
      config = await loadSanityJson()
      if (!query) {
        query = await loadGroqFromFile()
      }
      const variables = findVariablesInQuery(query)
      if (variables.length > 0) {
        params = await readParamsFile()
      }

      // FIXME: Throw error object in webview?
      const {ms, result} = await executeGroq({
        ...config,
        query,
        params,
        useCdn: config.token ? false : useCDN,
      })

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

      if (openJSONFile) {
        await openInUntitled(result, 'json')
      } else if (resultPanel) {
        const contentProvider = await registerContentProvider(context, result || [])
        const html = await contentProvider.getCurrentHTML()
        resultPanel.webview.html = html
      }
    } catch (err) {
      vscode.window.showErrorMessage(err.message)
      return
    }
  })
  context.subscriptions.push(disposable)

  function readConfig() {
    const settings = vscode.workspace.getConfiguration('sanity')
    openJSONFile = settings.get('openJSONFile', false)
    useCodelens = settings.get('useCodelens', true)
    useCDN = settings.get('useCDN', false)

    if (useCodelens && !codelens) {
      codelens = vscode.languages.registerCodeLensProvider(
        ['javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'groq'],
        new GROQCodeLensProvider()
      )

      context.subscriptions.push(codelens)
    } else if (!useCodelens && codelens) {
      const subIndex = context.subscriptions.indexOf(codelens)
      context.subscriptions.splice(subIndex, 1)
      codelens.dispose()
      codelens = undefined
    }
  }
}

async function loadSanityJson() {
  const config = (await loadConfig(getRootPath())) || (await loadConfig(getWorkspacePath()))
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
  const activeFile = getActiveFileName()
  const activeDir = path.dirname(activeFile)
  return activeDir
}

function getWorkspacePath(): string {
  const folders = vscode.workspace.workspaceFolders || []
  return folders.length > 0 ? folders[0].uri.fsPath : ''
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

async function readParamsFile(): Promise<Record<string, unknown>> {
  let defaultParamFile, absoluteParamFile
  const activeFile = getActiveFileName()
  if (activeFile && activeFile !== '') {
    var pos = activeFile.lastIndexOf('.')
    absoluteParamFile = activeFile.substr(0, pos < 0 ? activeFile.length : pos) + '.json'
    if (await checkFileExists(absoluteParamFile)) {
      defaultParamFile = path.basename(absoluteParamFile)
    }
  }
  const paramsFile = await vscode.window.showInputBox({value: defaultParamFile})
  if (!paramsFile) {
    throw new Error('Invalid param file received')
  }
  const content = await fs.readFile(path.join(path.dirname(absoluteParamFile), paramsFile), 'utf8')
  return JSON.parse(content)
}

async function openInUntitled(content: string, language?: string) {
  const cs = JSON.stringify(content)
  await vscode.workspace.openTextDocument({content: cs}).then((document) => {
    vscode.window.showTextDocument(document, {viewColumn: vscode.ViewColumn.Beside})
    vscode.languages.setTextDocumentLanguage(document, language || 'json')
  })
}
