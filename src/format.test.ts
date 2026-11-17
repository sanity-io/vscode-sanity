import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {formatGroq} from './format'

describe('formatGroq', () => {
  it('puts a minified query on real lines', async () => {
    const formatted = await formatGroq(
      '*[_type=="post"&&defined(slug.current)]{_id,title,"author":author->name,"cats":categories[]->{title}}|order(_createdAt desc)[0...10]'
    )
    assert.equal(
      formatted,
      [
        '*[_type == "post" && defined(slug.current)] {',
        '  _id,',
        '  title,',
        '  "author": author->.name,',
        '  "cats": categories[]-> {',
        '    title',
        '  }',
        '} | order(_createdAt desc)[0...10]',
      ].join('\n')
    )
  })

  it('returns undefined for text that is not GROQ', async () => {
    assert.equal(await formatGroq('not a query at all'), undefined)
  })
})
