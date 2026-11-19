import {readFile, stat} from 'node:fs/promises'
import vscode from 'vscode'
import {findGroqSpecifiers} from '../groq-imports/find-specifiers'
import {resolveGroqImport, type GroqImportHost} from '../groq-imports/resolve-groq-import'
import {EMBEDDED_GROQ_LANGUAGES} from '../languages'

export const GROQ_IMPORT_LANGUAGES = EMBEDDED_GROQ_LANGUAGES

// Unsaved edits to a tsconfig.json are used too, like the files fragments are read from.
const host: GroqImportHost = {
  async readFile(file) {
    const open = vscode.workspace.textDocuments.find((document) => document.uri.fsPath === file)
    if (open) {
      return open.getText()
    }
    try {
      return await readFile(file, 'utf8')
    } catch {
      return undefined
    }
  },
  async directoryExists(dir) {
    try {
      return (await stat(dir)).isDirectory()
    } catch {
      return false
    }
  },
}

async function resolveAt(document: vscode.TextDocument, specifier: string) {
  if (document.uri.scheme !== 'file') {
    return undefined
  }
  return resolveGroqImport(document.uri.fsPath, specifier, host)
}

function targetOf(file: string) {
  return new vscode.Location(vscode.Uri.file(file), new vscode.Position(0, 0))
}

/** Go to Definition on the specifier of a `.groq` import, which TypeScript does not follow. */
export class GroqImportDefinitionProvider implements vscode.DefinitionProvider {
  async provideDefinition(document: vscode.TextDocument, position: vscode.Position) {
    const offset = document.offsetAt(position)
    const hit = findGroqSpecifiers(document.getText()).find(
      ({start, end}) => offset >= start && offset <= end,
    )
    if (!hit) {
      return undefined
    }
    const resolved = await resolveAt(document, hit.specifier)
    // A path that is not on disk is not a definition. `baseUrl` otherwise turns every unmatched
    // specifier, including a package import, into a file that does not exist.
    return resolved?.exists ? targetOf(resolved.file) : undefined
  }
}

/** Makes the specifier a link, so Cmd/Ctrl+click opens the file even where definitions do not. */
export class GroqImportLinkProvider implements vscode.DocumentLinkProvider {
  async provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken) {
    const links: Array<vscode.DocumentLink> = []
    for (const {specifier, start, end} of findGroqSpecifiers(document.getText())) {
      const resolved = await resolveAt(document, specifier)
      if (token.isCancellationRequested) {
        return undefined
      }
      // A link to a file that is not there would only open an error.
      if (!resolved?.exists) {
        continue
      }
      const link = new vscode.DocumentLink(
        new vscode.Range(document.positionAt(start), document.positionAt(end)),
        vscode.Uri.file(resolved.file),
      )
      link.tooltip = 'Open GROQ file'
      links.push(link)
    }
    return links
  }
}
