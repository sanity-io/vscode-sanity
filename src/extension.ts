import path from 'node:path'
import vscode from 'vscode'
import {promises as fs, constants as fsconstants} from 'node:fs'
import {clearRequireCache} from './clearRequireCache'
import {Config} from './config/findConfig'
import {formatQuerySource} from './format'
import type {QueryParams} from './queryParams'
import {GROQCodeLensProvider} from './providers/groq-codelens-provider'
import {GroqHoverProvider, HOVER_LANGUAGES} from './providers/groq-hover-provider'
import {registerGroqLanguageServer, stopGroqLanguageServer} from './lsp/client'
import {findVariablesInQuery} from './variables'

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
  const disposable = vscode.commands.registerCommand('sanity.executeGroq', async (groqQuery) => {
    let config: Config
    let query: string = groqQuery
    let params: QueryParams = {}
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
      // Imported here, not at the top, to keep activation fast: @sanity/client alone takes ~100ms to load.
      const {executeGroq} = await import('./query')
      // FIXME: Throw error object in webview?
      const {ms, result} = await executeGroq({
        ...config.api,
        query,
        params,
        useCdn: config.api.token ? false : useCDN,
      })

      vscode.window.setStatusBarMessage(
        `Query took ${ms}ms` + (useCDN ? ' with cdn' : ' without cdn'),
        10_000,
      )

      if (!openJSONFile && !resultPanel) {
        resultPanel = vscode.window.createWebviewPanel(
          'executionResultsWebView',
          'GROQ Execution Result',
          vscode.ViewColumn.Beside,
          {},
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
          result || [],
        )
        const html = await contentProvider.getCurrentHTML()
        resultPanel.webview.html = html
      }
    } catch (error) {
      vscode.window.showErrorMessage(getErrorMessage(error))
      return
    }
  })
  context.subscriptions.push(
    disposable,
    vscode.commands.registerCommand(
      'sanity.formatQuery',
      async (uri: vscode.Uri, start: number, source: string) => {
        const document = await vscode.workspace.openTextDocument(uri)
        const range = new vscode.Range(
          document.positionAt(start),
          document.positionAt(start + source.length),
        )
        if (document.getText(range) !== source) {
          vscode.window.showWarningMessage(
            'The GROQ query changed before it could be formatted. Try again.',
          )
          return
        }
        const formatted = formatQuerySource(source)
        if (formatted === undefined) {
          vscode.window.showWarningMessage('Could not format the GROQ query: it does not parse.')
          return
        }
        if (formatted === source) {
          return
        }
        const edit = new vscode.WorkspaceEdit()
        edit.replace(uri, range, formatted)
        await vscode.workspace.applyEdit(edit)
      },
    ),
    vscode.languages.registerHoverProvider(HOVER_LANGUAGES, new GroqHoverProvider()),
  )
  registerGroqLanguageServer(context)

  function readConfig() {
    const settings = vscode.workspace.getConfiguration('sanity')
    openJSONFile = settings.get('openJSONFile', false)
    useCodelens = settings.get('useCodelens', true)
    useCDN = settings.get('useCDN', false)

    if (useCodelens && !codelens) {
      const provider = new GROQCodeLensProvider()
      codelens = vscode.Disposable.from(
        provider,
        vscode.languages.registerCodeLensProvider(
          ['javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'groq'],
          provider,
        ),
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

export function deactivate(): Promise<void> {
  return stopGroqLanguageServer()
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

  // Sucrase compiles local .ts imports too, and those stay cached after the hook is removed.
  clearRequireCache(require.resolve(configFilePath))

  // The extension host is shared with other extensions, so only hook `.ts` while loading the config.
  // Sucrase is imported here, not at the top, to keep activation fast.
  const {registerTS} = await import('sucrase/dist/register')
  const revertTsHook = registerTS()
  try {
    // sanity.cli.ts is a file the user wrote. It is loaded by path, so it cannot be a static import.
    // oxlint-disable-next-line @typescript-eslint/no-require-imports
    const config = require(configFilePath)
    return config.default
  } finally {
    revertTsHook()
  }
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
  params: QueryParams,
  ms: number,
  result: unknown,
) {
  // Imported here, not at the top, to keep React out of activation.
  const {GroqContentProvider} = await import('./providers/content-provider')
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

async function readParamsFile(): Promise<QueryParams> {
  const activeFile = getActiveFileName()
  if (activeFile && activeFile !== '') {
    const pos = activeFile.lastIndexOf('.')
    const absoluteParamFile = activeFile.slice(0, pos < 0 ? activeFile.length : pos) + '.json'
    if (await checkFileExists(absoluteParamFile)) {
      try {
        const content = await fs.readFile(absoluteParamFile)
        return JSON.parse(content.toString())
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to read parameter file: ${getErrorMessage(error)}`)
      }
    }
  }

  return {}
}

async function readParams(variables: Array<string>): Promise<QueryParams> {
  const values: QueryParams = await readParamsFile()
  const missing = variables.filter((variable) => !values[variable])
  for (const variable of missing) {
    let value = await vscode.window.showInputBox({title: `value for "${variable}"`, value: ''})
    if (!value) {
      continue
    }

    try {
      value = JSON.parse(value)
    } catch {
      // The value is kept as the raw string when it is not JSON.
    }
    values[variable] = value
  }

  return values
}

async function openInUntitled(content: unknown, language?: string) {
  const cs = JSON.stringify(content, null, 2)
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
