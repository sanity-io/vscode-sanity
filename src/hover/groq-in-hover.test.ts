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

describe('findGroqInHoverMarkdown', () => {
  it('finds the escaped double-quoted form TypeScript shows', () => {
    const found = findGroqInHoverMarkdown(fence(TS_QUICK_INFO))
    assert.deepEqual(found, [{query: QUERY, form: 'string'}])
    assert.ok(found[0].query.includes('\n'))
    assert.ok(!found[0].query.includes('\\n'))
  })

  it('finds a minified one line query', () => {
    const minified = '*[_type=="post"]{_id,title}'
    const found = findGroqInHoverMarkdown(fence(`const q: ${JSON.stringify(minified)}`))
    assert.deepEqual(found, [{query: minified, form: 'string'}])
  })

  it('finds the template literal form, with and without the groq comment', () => {
    const body = '*[_type == "post"]{\n  title\n}'
    assert.deepEqual(findGroqInHoverMarkdown(fence('type Q = `' + body + '`')), [
      {query: body, form: 'template'},
    ])
    assert.deepEqual(findGroqInHoverMarkdown(fence('type Q = /* groq */ `' + body + '`')), [
      {query: body, form: 'template'},
    ])
  })

  it('finds single quoted strings and ignores other literals', () => {
    const found = findGroqInHoverMarkdown(fence(`const a: 'hello', b: '*[_type == "x"]'`))
    assert.deepEqual(found, [{query: '*[_type == "x"]', form: 'string'}])
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
})
