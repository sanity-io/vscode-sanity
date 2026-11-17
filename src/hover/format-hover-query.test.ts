import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {formatGroq} from '../format'
import {formatQueryForHover, splitPreamble} from './format-hover-query'

const FUNCTIONS = [
  'fn image::asset($asset) = $asset-> { url, metadata };',
  'fn image::field($image) = $image { crop, hotspot, "asset": image::asset(asset) };',
].join('\n')

describe('splitPreamble', () => {
  it('splits custom functions and comments from the query', () => {
    const query = `${FUNCTIONS}\n\n// All posts\n*[_type == "post"]{title}`
    assert.deepEqual(splitPreamble(query), {
      preamble: `${FUNCTIONS}\n\n// All posts`,
      body: '*[_type == "post"]{title}',
    })
  })

  it('is not fooled by semicolons and braces inside strings and bodies', () => {
    const fn = `fn a::b($x) = $x{"t": "a;b}", u: 'c;'};`
    assert.deepEqual(splitPreamble(`${fn}\n*[_type == "post"]`), {
      preamble: fn,
      body: '*[_type == "post"]',
    })
  })

  it('leaves queries without a preamble alone', () => {
    assert.deepEqual(splitPreamble('*[_type == "post"]'), {
      preamble: '',
      body: '*[_type == "post"]',
    })
  })

  it('keeps an unfinished function definition in the body', () => {
    assert.deepEqual(splitPreamble('fn a::b($x) = $x'), {preamble: '', body: 'fn a::b($x) = $x'})
  })
})

describe('formatQueryForHover', () => {
  it('formats a minified query', () => {
    assert.equal(
      formatQueryForHover('*[_type=="post"]{_id,title}', formatGroq, 80),
      '*[_type == "post"] { _id, title }'
    )
  })

  it('breaks a query that does not fit the width across lines', () => {
    const query =
      '*[_type=="post"&&defined(slug.current)&&publishedAt<now()]|order(publishedAt desc)[$start...$end]{_id,title,"author":author->{name}}'
    assert.equal(
      formatQueryForHover(query, formatGroq, 80),
      [
        '*[_type == "post" && defined(slug.current) && publishedAt < now()]',
        '  | order(publishedAt desc)[$start...$end] {',
        '  _id,',
        '  title,',
        '  "author": author-> { name }',
        '}',
      ].join('\n')
    )
  })

  it('keeps custom functions and leading comments as authored and formats the query', () => {
    const query = `${FUNCTIONS}\n\n// All posts\n*[_type=="post"]{_id,"image":image::field(mainImage)}`
    assert.equal(
      formatQueryForHover(query, formatGroq, 80),
      `${FUNCTIONS}\n\n// All posts\n\n*[_type == "post"] { _id, "image": image::field(mainImage) }`
    )
  })

  it('keeps comments inside the query', () => {
    assert.equal(
      formatQueryForHover('*[_type == "post"] {\n  _id, // the id\n  title\n}', formatGroq, 80),
      '*[_type == "post"] {\n  _id, // the id\n  title\n}'
    )
  })

  it('passes the width to the formatter', () => {
    const widths: number[] = []
    formatQueryForHover('*[_type == "post"]', (query, width) => (widths.push(width), query), 42)
    assert.deepEqual(widths, [42])
  })

  it('returns the query as is when it cannot be formatted', () => {
    const query = '*[_type == "post"]{\n  title}'
    assert.equal(
      formatQueryForHover(query, () => undefined, 80),
      query
    )
    assert.equal(
      formatQueryForHover(
        query,
        () => {
          throw new Error('boom')
        },
        80
      ),
      query
    )
  })
})
