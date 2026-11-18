import {
  computeDocumentDiagnostics,
  extractQueries,
  findQueryAtOffset,
  getCompletionTriggerCharacters,
  getCompletions,
  getHoverInfo,
  offsetToQueryPosition,
  SchemaLoader,
  type GroqQuery,
} from '@sanity-labs/groq-lsp'
import {
  createConnection,
  DidChangeConfigurationNotification,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  type InitializeResult,
  type Position,
} from 'vscode-languageserver/node'
import {TextDocument} from 'vscode-languageserver-textdocument'
import {URI} from 'vscode-uri'
import {formatGroqDocument} from './formatting'
import type {ServerSettings} from './settings'

// Mirrors the `groq-lsp` bin of @sanity-labs/groq-lsp, except that formatting goes through
// groq-wasm (formatting.ts), the formatter hovers already use.

const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)
const schemaLoader = new SchemaLoader()
const documentQueries = new Map<string, Array<GroqQuery>>()

const defaultSettings: ServerSettings = {maxDiagnostics: 100, enableFormatting: true}
let settings = defaultSettings
let hasConfigurationCapability = false

connection.onInitialize((params) => {
  hasConfigurationCapability = !!params.capabilities.workspace?.configuration
  const workspaceUri = params.workspaceFolders?.[0]?.uri
  if (workspaceUri) {
    schemaLoader.discoverSchema(URI.parse(workspaceUri).fsPath)
  }

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: getCompletionTriggerCharacters(),
      },
      hoverProvider: true,
      documentFormattingProvider: true,
    },
  }
  if (params.capabilities.workspace?.workspaceFolders) {
    result.capabilities.workspace = {workspaceFolders: {supported: true}}
  }
  return result
})

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    void connection.client.register(DidChangeConfigurationNotification.type, undefined)
  }
  schemaLoader.startWatching((schema) => {
    connection.console.log(`Schema ${schema ? 'reloaded' : 'cleared'}`)
    documents.all().forEach(validateDocument)
  })
  connection.console.log('GROQ Language Server initialized')
})

connection.onDidChangeConfiguration((change) => {
  settings = change.settings?.groq ?? defaultSettings
  if (settings.schemaPath) {
    schemaLoader.loadFromPath(settings.schemaPath)
  }
  documents.all().forEach(validateDocument)
})

documents.onDidChangeContent((change) => validateDocument(change.document))
documents.onDidClose((event) => documentQueries.delete(event.document.uri))

function isNodeModulesPath(uri: string) {
  return uri.includes('/node_modules/') || uri.includes('\\node_modules\\')
}

function validateDocument(document: TextDocument) {
  const {uri} = document
  if (isNodeModulesPath(uri)) {
    void connection.sendDiagnostics({uri, diagnostics: []})
    return
  }
  const {queries} = extractQueries(document.getText(), document.languageId)
  documentQueries.set(uri, queries)
  const diagnostics =
    queries.length === 0
      ? []
      : computeDocumentDiagnostics(queries, {schema: schemaLoader.getSchema()})
  void connection.sendDiagnostics({
    uri,
    diagnostics: diagnostics.slice(0, settings.maxDiagnostics ?? 100),
  })
}

function queryAt(uri: string, position: Position) {
  const document = documents.get(uri)
  const queries = documentQueries.get(uri)
  if (!document || !queries) {
    return undefined
  }
  const offset = document.offsetAt(position)
  const query = findQueryAtOffset(queries, offset)
  return query && {query, offset: offsetToQueryPosition(query, offset)}
}

connection.onHover((params) => {
  const found = queryAt(params.textDocument.uri, params.position)
  return found ? getHoverInfo(found.query, found.offset, {schema: schemaLoader.getSchema()}) : null
})

connection.onCompletion((params) => {
  const found = queryAt(params.textDocument.uri, params.position)
  return found ? getCompletions(found.query, found.offset, {schema: schemaLoader.getSchema()}) : []
})

connection.onDocumentFormatting((params) => {
  const document = documents.get(params.textDocument.uri)
  if (!settings.enableFormatting || !document) {
    return []
  }
  return formatGroqDocument(document, params.options)
})

documents.listen(connection)
connection.listen()
