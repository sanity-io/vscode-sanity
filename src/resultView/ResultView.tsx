import React from 'react'
import {ReactJason} from 'react-jason'

export function ResultView({query, params, ms, result}: {query: string; params: Record<string, unknown>; ms: number; result: any}) {
  return (
    <div>
      <h2>Query result</h2>
      <p>Query: <code>{query}</code></p>
      <p>params: <code>{JSON.stringify(params)}</code></p>
      <p>Time: {ms}ms</p>
      <ReactJason value={result} />
    </div>
  )
}
