import React from 'react'
import {ReactJason} from 'react-jason'

export function ResultView({result}: {result: any}) {
  const count = Array.isArray(result) ? ` (${result.length})` : ''

  return (
    <div>
      <h2>Query result{count}</h2>
      <ReactJason value={result} />
    </div>
  )
}
