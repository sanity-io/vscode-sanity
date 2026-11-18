import path from 'node:path'
import type {WorkspaceConfiguration} from 'vscode'

/** The settings the GROQ language server reads from `workspace/didChangeConfiguration`. */
export interface ServerSettings {
  schemaPath?: string
  maxDiagnostics: number
  enableFormatting: boolean
}

export function readServerSettings(
  config: Pick<WorkspaceConfiguration, 'get'>,
  workspaceRoot: string | undefined,
): ServerSettings {
  const schemaPath = config.get<string>('schemaPath', '').trim()
  return {
    // The server resolves relative paths against its own working directory, not the workspace.
    schemaPath:
      schemaPath && workspaceRoot && !path.isAbsolute(schemaPath)
        ? path.join(workspaceRoot, schemaPath)
        : schemaPath || undefined,
    maxDiagnostics: config.get<number>('maxDiagnostics', 100),
    enableFormatting: config.get<boolean>('enableFormatting', true),
  }
}
