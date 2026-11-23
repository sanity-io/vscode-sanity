import assert from 'node:assert'
import vscode from 'vscode'
import {askParam} from '../../params/ask-param'

const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

async function whenPickerReady() {
  await wait(300)
}

describe('askParam', () => {
  afterEach(() => vscode.commands.executeCommand('workbench.action.closeQuickOpen'))

  it('picks one of the known values and keeps its type', async () => {
    const answer = askParam('type', ['author', 'post'])
    await whenPickerReady()
    await vscode.commands.executeCommand('workbench.action.quickOpenSelectNext')
    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem')
    assert.deepStrictEqual(await answer, {kind: 'suggestion', value: 'post'})
  })

  it('takes the text typed into the pick list even when it matches a known value', async () => {
    const createQuickPick = vscode.window.createQuickPick
    let picker: vscode.QuickPick<vscode.QuickPickItem> | undefined
    vscode.window.createQuickPick = <T extends vscode.QuickPickItem>() => {
      const created = createQuickPick<T>()
      picker = created
      return created
    }
    const answer = askParam('type', ['author', 'post'])
    vscode.window.createQuickPick = createQuickPick
    await whenPickerReady()
    await vscode.commands.executeCommand('workbench.action.quickOpenSelectNext')
    assert.ok(picker)
    picker.value = 'pos'
    await whenPickerReady()
    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem')
    assert.deepStrictEqual(await answer, {kind: 'typed', text: 'pos'})
  })

  it('resolves without an answer when dismissed', async () => {
    const answer = askParam('type', ['author', 'post'])
    await whenPickerReady()
    await vscode.commands.executeCommand('workbench.action.closeQuickOpen')
    assert.strictEqual(await answer, undefined)
  })
})
