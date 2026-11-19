import vscode from 'vscode'
import type {KnownValue} from './known-values'
import type {ParamAnswer} from './read-params'

type ParamItem = vscode.QuickPickItem & {answer: ParamAnswer}

function suggestionItems(suggestions: Array<KnownValue>): Array<ParamItem> {
  return suggestions.map((value) => ({
    label: String(value),
    answer: {kind: 'suggestion', value},
  }))
}

/**
 * Params with known values get a pick list that still takes any text typed into it. Params
 * without get the plain input box.
 */
export function askParam(
  variable: string,
  suggestions: Array<KnownValue>,
): Thenable<ParamAnswer | undefined> {
  const title = `value for "${variable}"`
  if (suggestions.length === 0) {
    return vscode.window
      .showInputBox({title, value: ''})
      .then((text) => (text === undefined ? undefined : {kind: 'typed', text}))
  }

  const known = suggestionItems(suggestions)
  return new Promise((resolve) => {
    const picker = vscode.window.createQuickPick<ParamItem>()
    picker.title = title
    picker.placeholder = 'Pick a value from the schema or type your own'
    picker.items = known

    picker.onDidChangeValue((text) => {
      if (!text || known.some((item) => item.label === text)) {
        picker.items = known
        return
      }
      const typed: ParamItem = {label: text, description: 'as typed', answer: {kind: 'typed', text}}
      picker.items = [typed, ...known]
      picker.activeItems = [typed]
    })

    let accepted: ParamAnswer | undefined
    picker.onDidAccept(() => {
      accepted = (picker.selectedItems[0] ?? picker.activeItems[0])?.answer
      picker.hide()
    })
    picker.onDidHide(() => {
      picker.dispose()
      resolve(accepted)
    })
    picker.show()
  })
}
