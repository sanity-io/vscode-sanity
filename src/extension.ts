import * as path from 'path'
import * as vscode from 'vscode'
import {promises as fs, constants as fsconstants} from 'fs'
import {parse} from 'groq-js'
import {register as registerTsNode} from 'ts-node'
import {Config} from './config/findConfig'
import {GroqContentProvider} from './providers/content-provider'
import {GROQCodeLensProvider} from './providers/groq-codelens-provider'
import {executeGroq} from './query'
import {formatGroq} from './format'

export function activate(context: vscode.ExtensionContext) {
  // needed to load sanity.cli.ts
  registerTsNode()

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
    let params: Record<string, unknown> = {}
    try {
      config = await loadSanityConfig()
      if (config === null) {
        return
      }

      if (!query) {
        query = await loadGroqFromFile()
      }
      const variables = findVariablesInQuery(query)
      if (variables.length > 0) {
        params = await readParams(variables)
      }

      vscode.window.showInformationMessage(`Executing GROQ query: ${query}`)
      // FIXME: Throw error object in webview?
      const {ms, result} = await executeGroq({
        ...config.api,
        query,
        params,
        useCdn: config.api.token ? false : useCDN,
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
        const contentProvider = await registerContentProvider(
          context,
          query,
          params,
          ms,
          result || []
        )
        const html = await contentProvider.getCurrentHTML()
        resultPanel.webview.html = html
      }
    } catch (err) {
      vscode.window.showErrorMessage(getErrorMessage(err))
      return
    }
  })
  context.subscriptions.push(disposable)

  context.subscriptions.push(
    vscode.commands.registerCommand('sanity.formatGroq', async (groqQuery: string, uri: string, range: vscode.Range) => {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(uri));
      const query = groqQuery;
      const formattedQuery = await formatGroq(query); // Await the async function

      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, range, formattedQuery);
      await vscode.workspace.applyEdit(edit);

      // Refresh the CodeLens
      await vscode.commands.executeCommand('vscode.executeCodeLensProvider', document.uri);
    })
  );

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

async function loadSanityConfig() {
  const configFiles = await vscode.workspace.findFiles('**/sanity.cli.ts', '**/node_modules/**')
  if (configFiles.length === 0) {
    throw new Error('Could not resolve sanity.cli.ts configuration file')
  }
  let configFilePath: string | undefined = configFiles[0].fsPath

  // if there are multiple files, ask the user to pick one
  if (configFiles.length > 1) {
    const values = configFiles.map((value) => {
      const workspacePath = vscode.workspace.getWorkspaceFolder(value)
      const label = path.relative(workspacePath?.uri.fsPath || '', value.fsPath)
      return {label, value}
    })

    configFilePath = await vscode.window
      .showQuickPick(values, {})
      .then((selected) => selected?.value.fsPath)
  }

  // the user canceled the quick pick
  if (!configFilePath) {
    return null
  }

  const exists = await checkFileExists(configFilePath)
  if (!exists) {
    throw new Error('Could not resolve sanity.cli.ts configuration file')
  }

  // clear require cache to ensure we get the latest version
  delete require.cache[require.resolve(configFilePath)]

  const config = require(configFilePath)
  return config.default
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
  query: string,
  params: Record<string, unknown>,
  ms: number,
  result: any
): Promise<any> {
  const contentProvider = new GroqContentProvider(query, params, ms, result)
  const registration = vscode.workspace.registerTextDocumentContentProvider('groq', contentProvider)
  context.subscriptions.push(registration)
  return contentProvider
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
  const activeFile = getActiveFileName()
  if (activeFile && activeFile !== '') {
    var pos = activeFile.lastIndexOf('.')
    const absoluteParamFile = activeFile.substring(0, pos < 0 ? activeFile.length : pos) + '.json'
    if (await checkFileExists(absoluteParamFile)) {
      try {
        const content = await fs.readFile(absoluteParamFile)
        return JSON.parse(content.toString())
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to read parameter file: ${getErrorMessage(err)}`)
      }
    }
  }

  return {}
}

async function readParams(variables: string[]): Promise<Record<string, unknown>> {
  const values: Record<string, unknown> = await readParamsFile()
  const missing = variables.filter((variable) => !values[variable])
  for (const variable of missing) {
    let value = await vscode.window.showInputBox({title: `value for "${variable}"`, value: ''})
    if (!value) {
      continue
    }

    try {
      value = JSON.parse(value)
    } catch (err) {
      // noop
    }
    values[variable] = value
  }

  return values
}

async function openInUntitled(content: string, language?: string) {
  const cs = JSON.stringify(content)
  await vscode.workspace.openTextDocument({content: cs}).then((document) => {
    vscode.window.showTextDocument(document, {viewColumn: vscode.ViewColumn.Beside})
    vscode.languages.setTextDocumentLanguage(document, language || 'json')
  })
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message
  }

  if (typeof err === 'string') {
    return err
  }

  return 'An error occurred'
}
