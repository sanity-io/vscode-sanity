import path from 'node:path'
import {commands, Uri, window, workspace, WorkspaceEdit} from 'vscode'
import type {ExtensionContext, LogOutputChannel} from 'vscode'
import {
  DidChangeConfigurationNotification,
  DocumentFormattingRequest,
  LanguageClient,
  TransportKind,
} from 'vscode-languageclient/node'
import type {LanguageClientOptions, ServerOptions} from 'vscode-languageclient/node'
import type {LSPAny} from 'vscode-languageserver-protocol'
import {readServerSettings} from './settings'

export const LSP_LANGUAGES = [
  'groq',
  'typescript',
  'typescriptreact',
  'javascript',
  'javascriptreact',
]

/**
 * Languages `Format Document` is offered for. In JavaScript and TypeScript the server only formats
 * the GROQ queries, so registering it there would compete with the user's formatter for the whole
 * file; `groq.formatQueries` formats the queries in those files instead.
 */
const DOCUMENT_FORMATTING_LANGUAGES = ['groq']

/** Saved files and unsaved editors. Other schemes, such as `git` or `output`, are not documents. */
const DOCUMENT_SCHEMES = ['file', 'untitled']

function selectorFor(languages: Array<string>) {
  return languages.flatMap((language) => DOCUMENT_SCHEMES.map((scheme) => ({scheme, language})))
}

let client: LanguageClient | undefined
let output: LogOutputChannel | undefined

/**
 * Starts the GROQ language server (diagnostics, completion, hover and formatting for `.groq` files
 * and groq`` template literals) bundled at dist/server.js, and registers its commands.
 */
export function registerGroqLanguageServer(context: ExtensionContext): void {
  output = window.createOutputChannel('GROQ Language Server', {log: true})
  context.subscriptions.push(
    output,
    commands.registerCommand('groq.restartServer', async () => {
      if (!isEnabled()) {
        window.showWarningMessage('The GROQ Language Server is disabled (see `groq.enable`)')
        return
      }
      await stopGroqLanguageServer()
      if (await startClient(context)) {
        window.showInformationMessage('GROQ Language Server restarted')
      } else {
        window.showWarningMessage('Failed to restart GROQ Language Server')
      }
    }),
    commands.registerCommand('groq.showOutput', () => output?.show()),
    commands.registerCommand('groq.formatQueries', formatQueriesInActiveEditor),
    workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration('groq.enable')) {
        if (isEnabled()) {
          await startClient(context)
        } else {
          await stopGroqLanguageServer()
        }
      } else if (event.affectsConfiguration('groq.schemaPath') && client) {
        // The server cannot unload a schema, and only looks for one in the workspace on start.
        await stopGroqLanguageServer()
        await startClient(context)
      }
    }),
  )

  if (isEnabled()) {
    void startClient(context)
  }
}

export async function stopGroqLanguageServer(): Promise<void> {
  const running = client
  client = undefined
  await running?.stop()
}

function isEnabled() {
  return workspace.getConfiguration('groq').get<boolean>('enable', true)
}

function workspaceRootFor(scopeUri: string | undefined): string | undefined {
  if (scopeUri) {
    const folder = workspace.getWorkspaceFolder(Uri.parse(scopeUri))
    if (folder) {
      return folder.uri.fsPath
    }
  }
  return workspace.workspaceFolders?.[0]?.uri.fsPath
}

function pulledGroqSettings(scopeUri: string | undefined) {
  return readServerSettings(workspace.getConfiguration('groq'), workspaceRootFor(scopeUri))
}

function isObject(value: LSPAny): value is {[key: string]: LSPAny} {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Replaces a pulled `groq` setting with the copy whose `schemaPath` is absolute. */
function resolvePulledSetting(
  scopeUri: string | undefined,
  section: string | undefined,
  value: LSPAny,
): LSPAny {
  if (section === 'groq.schemaPath') {
    return pulledGroqSettings(scopeUri).schemaPath ?? null
  }
  if (section === 'groq') {
    const resolved = pulledGroqSettings(scopeUri)
    return isObject(value) ? {...value, ...resolved} : resolved
  }
  if (section === undefined && isObject(value) && isObject(value.groq)) {
    return {...value, groq: {...value.groq, ...pulledGroqSettings(scopeUri)}}
  }
  return value
}

async function startClient(context: ExtensionContext): Promise<boolean> {
  if (!isEnabled()) {
    return false
  }
  if (client) {
    return true
  }

  const serverModule = context.asAbsolutePath(path.join('dist', 'server.js'))
  const serverOptions: ServerOptions = {
    run: {module: serverModule, transport: TransportKind.ipc},
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: {execArgv: ['--nolazy', '--inspect=6009']},
    },
  }

  const sendSettings = () =>
    newClient.sendNotification(DidChangeConfigurationNotification.type, {
      settings: {groq: pulledGroqSettings(undefined)},
    })

  const clientOptions: LanguageClientOptions = {
    documentSelector: selectorFor(LSP_LANGUAGES),
    // Sends the settings once the server is up and again when they change.
    synchronize: {configurationSection: 'groq'},
    middleware: {
      workspace: {
        // The server registers for configuration changes without naming a section, for which the
        // client sends `settings: null` and the server falls back to its defaults. Always send the
        // resolved `groq` settings instead.
        didChangeConfiguration: () => sendSettings(),
        // The server also reads settings with `workspace/configuration`. That pull returns the raw
        // setting, so a relative `schemaPath` would be resolved against the server's working
        // directory. Answer it with the same resolved settings.
        configuration: async (params, token, next) => {
          const values = await next(params, token)
          if (!Array.isArray(values)) {
            return values
          }
          const pulled: Array<LSPAny> = values
          /* oxlint-disable typescript/no-unsafe-return -- LSPAny is `any`, as is the middleware's result */
          return params.items.map((item, index) =>
            resolvePulledSetting(item.scopeUri, item.section, pulled[index]),
          )
          /* oxlint-enable typescript/no-unsafe-return */
        },
      },
    },
    outputChannel: output,
  }

  // The `groq` id makes the client read the `groq.trace.server` setting.
  const newClient = new LanguageClient('groq', 'GROQ Language Server', serverOptions, clientOptions)
  const formatting = newClient.getFeature(DocumentFormattingRequest.method)
  const initializeFormatting = formatting.initialize.bind(formatting)
  formatting.initialize = (capabilities) =>
    initializeFormatting(capabilities, selectorFor(DOCUMENT_FORMATTING_LANGUAGES))

  client = newClient
  try {
    await newClient.start()
    return true
  } catch (error) {
    output?.error(`Failed to start the GROQ Language Server: ${error}`)
    if (client === newClient) {
      client = undefined
    }
    return false
  }
}

async function formatQueriesInActiveEditor(): Promise<void> {
  const editor = window.activeTextEditor
  if (!editor || !LSP_LANGUAGES.includes(editor.document.languageId)) {
    return
  }
  if (!client) {
    window.showWarningMessage('The GROQ Language Server is not running (see `groq.enable`)')
    return
  }

  const {document, options} = editor
  const result = await client.sendRequest(DocumentFormattingRequest.type, {
    textDocument: client.code2ProtocolConverter.asTextDocumentIdentifier(document),
    options: {
      tabSize: typeof options.tabSize === 'number' ? options.tabSize : 2,
      insertSpaces: options.insertSpaces !== false,
    },
  })
  const edits = await client.protocol2CodeConverter.asTextEdits(result)
  if (!edits?.length) {
    return
  }

  const workspaceEdit = new WorkspaceEdit()
  workspaceEdit.set(document.uri, edits)
  await workspace.applyEdit(workspaceEdit)
}
