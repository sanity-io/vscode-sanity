import React from 'react'
import {ReactJason} from 'react-jason'

export function ResultView({result}: {result: any}) {
  return (
    <div>
      <h2>Query result</h2>
      <ReactJason value={result} />
    </div>
  )
}
