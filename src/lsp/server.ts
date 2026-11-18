import {basename, extname} from 'node:path'
import {
  computeDocumentDiagnostics,
  ContentMapperConfigs,
  extractQueries,
  findQueryAtOffset,
  getCompletionTriggerCharacters,
  getCompletions,
  getHoverInfo,
  offsetToQueryPosition,
  SchemaFileCache,
  SchemaLoader,
  type GroqFunction,
  type GroqQuery,
} from '@sanity-labs/groq-lsp'
import type {SchemaType} from 'groq-js'
import {
  createConnection,
  DidChangeConfigurationNotification,
  DidChangeWatchedFilesNotification,
  FileChangeType,
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

// groq-content-mapper's settings from the tsconfig.json nearest each document, and the schemas
// they name.
const contentMapperConfigs = new ContentMapperConfigs()
const contentMapperSchemas = new SchemaFileCache()
const reportedProblems = new Set<string>()
const watchedGlobs = new Set<string>()
let hasWatchedFilesDynamicRegistration = false

const defaultSettings: ServerSettings = {maxDiagnostics: 100, enableFormatting: true}
let settings = defaultSettings
let hasConfigurationCapability = false

connection.onInitialize((params) => {
  hasConfigurationCapability = !!params.capabilities.workspace?.configuration
  hasWatchedFilesDynamicRegistration =
    !!params.capabilities.workspace?.didChangeWatchedFiles?.dynamicRegistration
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
  watchGlobs(['**/tsconfig.json', '**/*.groq'])
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

connection.onDidChangeWatchedFiles((params) => {
  const mapperFiles = new Set(
    contentMapperConfigs
      .all()
      .flatMap((config) => [...config.schemaPaths, ...(config.functions?.files ?? [])]),
  )
  const mapperChanged = params.changes.some(({uri, type}) => {
    const file = URI.parse(uri).fsPath
    return (
      basename(file) === 'tsconfig.json' ||
      mapperFiles.has(file) ||
      // A new or deleted .groq file may be one a `functions` glob matches.
      (extname(file) === '.groq' && type !== FileChangeType.Changed)
    )
  })
  if (mapperChanged) {
    contentMapperConfigs.invalidate()
    contentMapperSchemas.clear()
    reportedProblems.clear()
    documents.all().forEach(validateDocument)
  }
})

function watchGlobs(globs: Array<string>) {
  const added = globs.filter((glob) => !watchedGlobs.has(glob))
  if (!hasWatchedFilesDynamicRegistration || added.length === 0) {
    return
  }
  added.forEach((glob) => watchedGlobs.add(glob))
  void connection.client.register(DidChangeWatchedFilesNotification.type, {
    watchers: added.map((globPattern) => ({globPattern})),
  })
}

function reportOnce(problem: string) {
  if (!reportedProblems.has(problem)) {
    reportedProblems.add(problem)
    connection.console.warn(problem)
  }
}

interface DocumentContext {
  schema: SchemaType | undefined
  functions: Map<string, GroqFunction> | undefined
}

// The schema is the one `groq.schemaPath` names, else a well-known schema file in the workspace,
// else the one groq-content-mapper's settings give the file. The functions are those of the
// mapper's `functions` option, for the file extensions the mapper handles.
function contextFor(uri: string): DocumentContext {
  const parsed = URI.parse(uri)
  const file = parsed.scheme === 'file' ? parsed.fsPath : undefined
  const config = file ? contentMapperConfigs.forFile(file) : undefined
  if (config) {
    config.issues.forEach(reportOnce)
    watchGlobs(config.schemaPaths.map((schemaPath) => `**/${basename(schemaPath)}`))
  }

  let schema = schemaLoader.getSchema()
  const mapperSchemaPath = file && config?.schemaFor(file)
  if (!schema && mapperSchemaPath) {
    const state = contentMapperSchemas.load(mapperSchemaPath)
    if (state.error) {
      reportOnce(state.error)
    }
    schema = state.schema
  }

  return {
    schema,
    functions: file && config?.handles(file) ? config.functions?.functions : undefined,
  }
}

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
    queries.length === 0 ? [] : computeDocumentDiagnostics(queries, contextFor(uri))
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
  return found ? getHoverInfo(found.query, found.offset, contextFor(params.textDocument.uri)) : null
})

connection.onCompletion((params) => {
  const found = queryAt(params.textDocument.uri, params.position)
  return found
    ? getCompletions(found.query, found.offset, {
        schema: contextFor(params.textDocument.uri).schema,
      })
    : []
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
