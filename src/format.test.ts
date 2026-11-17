import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {formatGroq} from './format'

const QUERY =
  '*[_type=="post"&&defined(slug.current)]{_id,title,"author":author->{name,"avatar":avatar.asset->url},"categories":categories[]->{title,"slug":slug.current}}|order(_createdAt desc)[0...10]'

describe('formatGroq', () => {
  it('puts a minified query on real lines, wrapped to 80 columns', () => {
    const formatted = formatGroq(QUERY)
    assert.equal(
      formatted,
      [
        '*[_type == "post" && defined(slug.current)] {',
        '  _id,',
        '  title,',
        '  "author": author-> { name, "avatar": avatar.asset->url },',
        '  "categories": categories[]-> { title, "slug": slug.current }',
        '}',
        '  | order(_createdAt desc)[0...10]',
      ].join('\n')
    )
    for (const line of formatted!.split('\n')) assert.ok(line.length <= 80, line)
  })

  it('wraps to a narrower width when asked', () => {
    const formatted = formatGroq(QUERY, 40)!
    assert.ok(formatted.split('\n').length > formatGroq(QUERY)!.split('\n').length)
    assert.ok(formatted.includes('"author": author-> {\n    name,'), formatted)
  })

  it('keeps comments', () => {
    assert.equal(
      formatGroq('*[_type == "post"]{_id, // the id\ntitle}'),
      '*[_type == "post"] {\n  _id, // the id\n  title\n}'
    )
  })

  it('returns undefined for text that is not GROQ', () => {
    assert.equal(formatGroq('*[_type == '), undefined)
  })
})
