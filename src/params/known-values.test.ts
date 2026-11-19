import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import type {ObjectAttribute, SchemaType, TypeNode} from 'groq-js'
import {findKnownParamValues} from './known-values'

const literal = (value: string): TypeNode => ({type: 'string', value})
function attribute(value: TypeNode, optional = false): ObjectAttribute {
  const field: ObjectAttribute = {type: 'objectAttribute', value}
  if (optional) {
    field.optional = true
  }
  return field
}

const schema: SchemaType = [
  {
    type: 'document',
    name: 'post',
    attributes: {
      _type: attribute(literal('post')),
      title: attribute({type: 'string'}),
      status: attribute({type: 'union', of: [literal('draft'), literal('live')]}, true),
      rating: attribute({
        type: 'union',
        of: [
          {type: 'number', value: 1},
          {type: 'number', value: 2},
        ],
      }),
      meta: attribute({
        type: 'object',
        attributes: {kind: attribute({type: 'union', of: [literal('news'), literal('guide')]})},
      }),
    },
  },
  {
    type: 'document',
    name: 'author',
    attributes: {
      _type: attribute(literal('author')),
      name: attribute({type: 'string'}),
      status: attribute({type: 'string'}),
    },
  },
]

const known = (query: string) =>
  Object.fromEntries(
    [...findKnownParamValues(query, schema)].map(([param, values]) => [
      param,
      [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)),
    ]),
  )

describe('findKnownParamValues', () => {
  it('suggests the document type names for a parameter compared with _type', () => {
    const values = known('*[_type == $type && defined(slug.current)] { "slug": slug.current }')
    assert.deepEqual(Object.keys(values), ['type'])
    assert.deepEqual(values.type, ['author', 'post'])
  })

  it('handles the parameter on either side and !=', () => {
    assert.deepEqual(known('*[$type == _type]').type, ['author', 'post'])
    assert.deepEqual(known('*[_type != $type]').type, ['author', 'post'])
  })

  it('suggests the values of a string literal union once _type narrows the documents', () => {
    assert.deepEqual(known('*[_type == "post" && status == $status]'), {status: ['draft', 'live']})
    assert.deepEqual(known('*[_type == "post"][status == $status]'), {status: ['draft', 'live']})
  })

  it('follows nested attributes and non-string literals', () => {
    assert.deepEqual(known('*[_type == "post" && meta.kind == $kind]'), {kind: ['guide', 'news']})
    assert.deepEqual(known('*[_type == "post" && rating == $rating]'), {rating: [1, 2]})
  })

  it('suggests nothing when the value set is open', () => {
    assert.deepEqual(known('*[_type == "post" && title == $title]'), {})
    assert.deepEqual(known('*[_type == "post" && lower(title) == $title]'), {})
  })

  it('still suggests the types when the schema has nothing that matches the rest of the filter', () => {
    assert.deepEqual(known('*[_type == $type && defined(noSuchField.current)]'), {
      type: ['author', 'post'],
    })
  })

  it('suggests nothing when any document the filter looks at has an open field', () => {
    // author.status is a plain string
    assert.deepEqual(known('*[status == $status]'), {})
  })

  it('suggests nothing for fields the schema does not have', () => {
    assert.deepEqual(known('*[_type == "post" && unknown == $value]'), {})
    assert.deepEqual(known('*[_type == "nothing" && status == $status]'), {})
  })

  it('suggests nothing for a parameter that is also used somewhere open', () => {
    assert.deepEqual(known('*[_type == $v && title == $v]'), {})
    assert.deepEqual(known('*[_type == $v][0...$v]'), {})
    assert.deepEqual(known('*[_type == $a && _type == $b]').b, ['author', 'post'])
    assert.deepEqual(known('*[_type == "post" && _id == $a && status == $a]'), {})
  })

  it('merges closed sets from several comparisons of one parameter', () => {
    assert.deepEqual(known('*[_type == "post" && (status == $v || meta.kind == $v)]').v, [
      'draft',
      'guide',
      'live',
      'news',
    ])
  })

  it('works per parameter', () => {
    const values = known('*[_type == $type && title == $title && status == $status]')
    assert.deepEqual(Object.keys(values), ['type'])
  })

  it('ignores comparisons outside of a filter and in projections of it', () => {
    assert.deepEqual(known('{"a": $type == "post"}'), {})
    assert.deepEqual(known('*[_type == "post"]{"a": status == $status}'), {})
  })

  it('scopes comparisons in nested filters to their own documents', () => {
    const values = known('*[_type == "post" && count(*[_type == "author" && name == $name]) > 0]')
    assert.deepEqual(values, {})
    assert.deepEqual(known('*[_type == "post" && count(*[_type == $kind]) > 0]').kind, [
      'author',
      'post',
    ])
  })

  it('returns nothing for a query that cannot be parsed or has no parameters', () => {
    assert.deepEqual(known('*[_type =='), {})
    assert.deepEqual(known('*[_type == "post"]'), {})
  })

  it('returns nothing for an empty schema', () => {
    assert.equal(findKnownParamValues('*[_type == $type]', []).size, 0)
  })
})
