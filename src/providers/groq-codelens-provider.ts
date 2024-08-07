import {type CodeLensProvider, type TextDocument, type CancellationToken, CodeLens, Range, Position} from 'vscode'

interface ExtractedQuery {
  content: string
  uri: string
  range: Range;
}

function extractAllTemplateLiterals(document: TextDocument): ExtractedQuery[] {
  const documents: ExtractedQuery[] = [];
  const text = document.getText();
  const regExpGQL = new RegExp('groq\\s*`([\\s\\S]+?)`', 'mg');

  let result;
  while ((result = regExpGQL.exec(text)) !== null) {
    const content = result[1];
    const startPosition = document.positionAt(result.index + result[0].indexOf(content));
    const endPosition = document.positionAt(result.index + result[0].indexOf(content) + content.length);
    const range = new Range(startPosition, endPosition);
    documents.push({
      content: content,
      uri: document.uri.path,
      range: range,
    });
  }
  return documents;
}

function extractAllDefineQuery(document: TextDocument): ExtractedQuery[] {
  const documents: ExtractedQuery[] = [];
  const text = document.getText();
  const pattern = '(\\s*defineQuery\\((["\'`])([\\s\\S]*?)\\2\\))';
  const regexp = new RegExp(pattern, 'g');

  let result;
  while ((result = regexp.exec(text)) !== null) {
    const content = result[3];
    const startPosition = document.positionAt(result.index + result[0].indexOf(content));
    const endPosition = document.positionAt(result.index + result[0].indexOf(content) + content.length);
    const range = new Range(startPosition, endPosition);
    documents.push({
      content: content,
      uri: document.uri.path,
      range: range,
    });
  }
  return documents;
}

export class GROQCodeLensProvider implements CodeLensProvider {
  constructor() {}

  public provideCodeLenses(document: TextDocument, _token: CancellationToken): CodeLens[] {

    if (document.languageId === 'groq') {
      return [
        new CodeLens(new Range(new Position(0, 0), new Position(0, 0)), {
          title: 'Execute Query',
          command: 'sanity.executeGroq',
          arguments: [document.getText()],
        }),
        new CodeLens(new Range(new Position(0, 0), new Position(0, 0)), {
          title: 'Format Query',
          command: 'sanity.formatGroq',
          arguments: [document.getText(), document.uri, new Position(0, 0)],
        }),
      ];
    }

    // find all lines where "groq" exists
    const queries: ExtractedQuery[] = [...extractAllTemplateLiterals(document), ...extractAllDefineQuery(document)];

    // add a button above each line that has groq
    const lenses: CodeLens[] = [];
    queries.forEach((def) => {
      lenses.push(new CodeLens(
        def.range,
        {
          title: 'Execute Query',
          command: 'sanity.executeGroq',
          arguments: [def.content],
        }
      ));
      lenses.push(new CodeLens(
        def.range,
        {
          title: 'Format Query',
          command: 'sanity.formatGroq',
          arguments: [def.content, def.uri, def.range],
        }
      ));
    });
    return lenses;
  }
}
