import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import type {KnownParamValues} from './known-values'
import {AskParam, ParamAnswer, readMissingParams} from './read-params'

function recorder(answers: Record<string, ParamAnswer | undefined>) {
  const asked: Array<[string, Array<unknown>]> = []
  const ask: AskParam = async (variable, suggestions) => {
    asked.push([variable, suggestions])
    return answers[variable]
  }
  return {asked, ask}
}

describe('readMissingParams', () => {
  it('passes the known values of each parameter and only asks for what is missing', async () => {
    const known: KnownParamValues = new Map([['type', ['author', 'post']]])
    const {asked, ask} = recorder({
      type: {kind: 'suggestion', value: 'post'},
      limit: {kind: 'typed', text: '10'},
    })
    const values = await readMissingParams(
      ['type', 'limit', 'fromFile'],
      {fromFile: 'x'},
      known,
      ask,
    )
    assert.deepEqual(asked, [
      ['type', ['author', 'post']],
      ['limit', []],
    ])
    assert.deepEqual(values, {fromFile: 'x', type: 'post', limit: 10})
  })

  it('keeps the type of a suggestion and parses typed text as JSON when it can', async () => {
    const {ask} = recorder({
      a: {kind: 'suggestion', value: '42'},
      b: {kind: 'typed', text: '42'},
      c: {kind: 'typed', text: '["x"]'},
      d: {kind: 'typed', text: 'post'},
      e: {kind: 'suggestion', value: 2},
    })
    assert.deepEqual(await readMissingParams(['a', 'b', 'c', 'd', 'e'], {}, new Map(), ask), {
      a: '42',
      b: 42,
      c: ['x'],
      d: 'post',
      e: 2,
    })
  })

  it('leaves out parameters that were dismissed or left empty', async () => {
    const {ask} = recorder({a: undefined, b: {kind: 'typed', text: ''}})
    assert.deepEqual(await readMissingParams(['a', 'b'], {}, new Map(), ask), {})
  })
})
