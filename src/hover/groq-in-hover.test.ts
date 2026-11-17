import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {decodeEscapes, findGroqInHoverMarkdown, isGroqQuery} from './groq-in-hover'

const QUERY = `*[_type == "post" && defined(slug.current)]{
  _id,
  "author": author->name
} | order(_createdAt desc)[0...10]`

// Verbatim `displayParts` from TypeScript quick info for:
//   type Q = /* groq */ `<QUERY>`
const TS_QUICK_INFO =
  'type Q = "*[_type == \\"post\\" && defined(slug.current)]{\\n  _id,\\n  \\"author\\": author->name\\n} | order(_createdAt desc)[0...10]"'

const fence = (code: string, lang = 'typescript') => '```' + lang + '\n' + code + '\n```'

describe('decodeEscapes', () => {
  it('decodes the escapes TypeScript prints', () => {
    assert.equal(
      decodeEscapes('a\\nb\\t\\"c\\" \\\\ \\u0041 \\x42 \\u{1F600}'),
      'a\nb\t"c" \\ A B \u{1F600}'
    )
  })

  it('drops line continuations and keeps unknown escapes', () => {
    assert.equal(decodeEscapes('a\\\nb \\q'), 'ab q')
  })
})

describe('isGroqQuery', () => {
  it('accepts queries that reference the dataset', () => {
    assert.ok(isGroqQuery('*[_type == "post"]'))
    assert.ok(isGroqQuery('count(*[_type == "post"])'))
    assert.ok(isGroqQuery('*[_type == $type][0]{title}'))
  })

  it('rejects ordinary strings and invalid GROQ', () => {
    assert.ok(!isGroqQuery('hello world'))
    assert.ok(!isGroqQuery('post'))
    assert.ok(!isGroqQuery('*[_type == '))
    assert.ok(!isGroqQuery('2 * 3'))
    assert.ok(!isGroqQuery(''))
  })

  it('trusts a groq marker for queries without a dataset reference', () => {
    assert.ok(!isGroqQuery('{"a": 1}'))
    assert.ok(isGroqQuery('{"a": 1}', true))
  })
})

// Verbatim quick info from tsgo (TypeScript 7.1 beta) for a `.groq` import that calls custom
// functions, prettified by groq-content-mapper: definitions first, then the query, `& ...` for the
// elided result and params brands.
const TSGO_WITH_FUNCTIONS =
  '(alias) const query: "fn image::asset($asset) = $asset-> { url, metadata };\\nfn image::field($image) = $image { crop, hotspot, \\"asset\\": image::asset(asset) };\\n\\n// All published posts\\n*[_type == \\"post\\" && defined(slug.current)]\\n  | order(publishedAt desc)[$start...$end] {\\n  _id,\\n  \\"image\\": image::field(mainImage)\\n}" & ...'

describe('findGroqInHoverMarkdown', () => {
  it('finds the escaped double-quoted form TypeScript shows', () => {
    const found = findGroqInHoverMarkdown(fence(TS_QUICK_INFO))
    assert.deepEqual(found, [{kind: 'query', query: QUERY, form: 'string'}])
    assert.ok(found[0].query.includes('\n'))
    assert.ok(!found[0].query.includes('\\n'))
  })

  it('finds a minified one line query', () => {
    const minified = '*[_type=="post"]{_id,title}'
    const found = findGroqInHoverMarkdown(fence(`const q: ${JSON.stringify(minified)}`))
    assert.deepEqual(found, [{kind: 'query', query: minified, form: 'string'}])
  })

  it('finds the template literal form, with and without the groq comment', () => {
    const body = '*[_type == "post"]{\n  title\n}'
    assert.deepEqual(findGroqInHoverMarkdown(fence('type Q = `' + body + '`')), [
      {kind: 'query', query: body, form: 'template'},
    ])
    assert.deepEqual(findGroqInHoverMarkdown(fence('type Q = /* groq */ `' + body + '`')), [
      {kind: 'query', query: body, form: 'template'},
    ])
  })

  it('finds single quoted strings and ignores other literals', () => {
    const found = findGroqInHoverMarkdown(fence(`const a: 'hello', b: '*[_type == "x"]'`))
    assert.deepEqual(found, [{kind: 'query', query: '*[_type == "x"]', form: 'string'}])
  })

  it('ignores prose and unfenced text', () => {
    const markdown = [
      fence('const title: string'),
      '---',
      `Don't use "*[_type == \\"post\\"]" here, it's slow.`,
    ].join('\n')
    assert.deepEqual(findGroqInHoverMarkdown(markdown), [])
  })

  it('returns nothing for non-GROQ hovers', () => {
    assert.deepEqual(findGroqInHoverMarkdown(fence('type Greeting = "hello world"')), [])
  })

  it('finds a query with prepended custom functions, comments and slice params', () => {
    const found = findGroqInHoverMarkdown(fence(TSGO_WITH_FUNCTIONS))
    assert.equal(found.length, 1)
    const [hit] = found
    assert.equal(hit.kind, 'query')
    assert.ok(hit.kind === 'query' && hit.query.startsWith('fn image::asset($asset) = '))
    assert.ok(
      hit.kind === 'query' && hit.query.includes('\n// All published posts\n*[_type == "post"')
    )
    assert.ok(hit.kind === 'query' && hit.query.endsWith('}'))
  })

  it('finds the query before an intersection with the result and params brands', () => {
    const found = findGroqInHoverMarkdown(
      fence(
        '(alias) const query: "*[_type == \\"post\\"][0] { _id, title }" & {\n    readonly __groqResult?: QueryResponse;\n}'
      )
    )
    assert.deepEqual(found, [
      {kind: 'query', query: '*[_type == "post"][0] { _id, title }', form: 'string'},
    ])
  })

  it('reports a hover cut off by the language server instead of returning half a query', () => {
    // tsgo stops after ~5000 characters, mid-literal, and appends "...".
    const cut = TSGO_WITH_FUNCTIONS.slice(0, TSGO_WITH_FUNCTIONS.indexOf('$start')) + '...'
    const found = findGroqInHoverMarkdown(fence(cut))
    assert.equal(found.length, 1)
    assert.equal(found[0].kind, 'truncated')
    assert.ok(found[0].kind === 'truncated' && found[0].partial.startsWith('fn image::asset'))
  })

  it('reports truncation when the cut lands in the middle of an escape', () => {
    const found = findGroqInHoverMarkdown(fence('const query: "*[_type == \\"post\\"]{\\n  \\"...'))
    assert.deepEqual(
      found.map(({kind}) => kind),
      ['truncated']
    )
  })

  it('does not report truncation for unrelated unterminated text', () => {
    assert.deepEqual(findGroqInHoverMarkdown(fence('const greeting: "hello world...')), [])
    assert.deepEqual(
      findGroqInHoverMarkdown(fence('const query: "*[_type == \\"post\\"]{ _id }')),
      []
    )
  })
})
