import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {formatGroq} from '../format'
import {formatQueryForHover, hasComment, splitPreamble} from './format-hover-query'

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

describe('hasComment', () => {
  it('ignores slashes inside strings', () => {
    assert.ok(!hasComment('*[url == "https://example.com"]'))
    assert.ok(hasComment('*[_type == "post"] // posts'))
  })
})

describe('formatQueryForHover', () => {
  it('formats a minified query', async () => {
    assert.equal(
      await formatQueryForHover('*[_type=="post"]{_id,title}', formatGroq),
      '*[_type == "post"] {\n  _id,\n  title\n}'
    )
  })

  it('keeps custom functions and leading comments as authored and formats the query', async () => {
    const query = `${FUNCTIONS}\n\n// All posts\n*[_type=="post"]{_id,"image":image::field(mainImage)}`
    assert.equal(
      await formatQueryForHover(query, formatGroq),
      `${FUNCTIONS}\n\n// All posts\n\n*[_type == "post"] {\n  _id,\n  "image": image::field(mainImage)\n}`
    )
  })

  it('formats slices that use params', async () => {
    assert.equal(
      await formatQueryForHover('*[_type=="post"][$start...$end]{_id}', formatGroq),
      '*[_type == "post"][$start...$end] {\n  _id\n}'
    )
  })

  it('does not format over comments inside the query, since groqfmt would drop them', async () => {
    const query = '*[_type == "post"] {\n  _id, // the id\n  title\n}'
    assert.equal(await formatQueryForHover(query, formatGroq), query)
  })

  it('returns the query as is when it cannot be formatted', async () => {
    const query = '*[_type == "post"]{\n  title}'
    assert.equal(await formatQueryForHover(query, async () => undefined), query)
    assert.equal(
      await formatQueryForHover(query, async () => {
        throw new Error('boom')
      }),
      query
    )
  })
})
