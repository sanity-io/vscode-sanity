import {strict as assert} from 'node:assert'
import {describe, it} from 'node:test'
import {findVariablesInQuery} from './variables'

void describe('findVariablesInQuery', () => {
  void it('finds parameters in filters, projections and function calls', () => {
    assert.deepEqual(
      findVariablesInQuery('*[_type == $type && slug.current == $slug]{title, "n": count($ids)}'),
      ['type', 'slug', 'ids'],
    )
  })

  void it('handles null literals', () => {
    assert.deepEqual(findVariablesInQuery('*[_type == $type && body == null]'), ['type'])
  })

  void it('returns nothing for a query without parameters', () => {
    assert.deepEqual(findVariablesInQuery('*[_type == "post"]'), [])
  })
})
