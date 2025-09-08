import {
  type CodeLensProvider,
  type TextDocument,
  type CancellationToken,
  CodeLens,
  Range,
  Position,
} from 'vscode'

import {resolveQueries} from '../ast/resolve-queries'

interface ExtractedQuery {
  content: string
  uri: string
  position: Position
}

async function extractAllQueries(document: TextDocument): Promise<ExtractedQuery[]> {
  const text = document.getText()
  const path = document.uri.path

  if (text.match(/defineQuery/g) || text.match(/groq`/g)) {
    const resolved = await resolveQueries(text, path)

    return resolved.map((query) => {
      return {
        content: query.content,
        uri: document.uri.path,
        position: query.position,
      }
    })
  }

  return []
}

export class GROQCodeLensProvider implements CodeLensProvider {
  constructor() {}

  public async provideCodeLenses(
    document: TextDocument,
    _token: CancellationToken,
  ): Promise<CodeLens[]> {
    if (document.languageId === 'groq') {
      return [
        new CodeLens(new Range(new Position(0, 0), new Position(0, 0)), {
          title: 'Execute Query',
          command: 'sanity.executeGroq',
          arguments: [document.getText()],
        }),
      ]
    }

    const queries: ExtractedQuery[] = await extractAllQueries(document)

    // add a button above each line that has groq
    return queries.flatMap((def) => {
      return [
        new CodeLens(
          new Range(new Position(def.position.line, 0), new Position(def.position.line, 0)),
          {
            title: 'Execute Query',
            command: 'sanity.executeGroq',
            arguments: [def.content],
          },
        ),
      ]
    })
  }
}
