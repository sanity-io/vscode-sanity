import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {ResultView} from './ResultView'

function heading(result: unknown) {
  const html = renderToStaticMarkup(<ResultView query="*" params={{}} ms={1} result={result} />)
  return html.match(/<h2>(.*?)<\/h2>/)?.[1]
}

describe('ResultView', () => {
  it('shows how many results an array has', () => {
    assert.equal(heading([{_id: 'a'}, {_id: 'b'}, {_id: 'c'}]), 'Query result (3)')
    assert.equal(heading([]), 'Query result (0)')
  })

  it('shows no count for results that are not arrays', () => {
    assert.equal(heading({_id: 'a'}), 'Query result')
    assert.equal(heading(0), 'Query result')
    assert.equal(heading(null), 'Query result')
  })
})
