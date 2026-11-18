import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {DEFAULT_API_VERSION} from './apiVersion'
import {createQueryClient} from './client'

const base = {projectId: 'abc123', dataset: 'production', useCdn: false}

describe('createQueryClient', () => {
  it('uses the configured API version', () => {
    const client = createQueryClient({...base, apiVersion: 'v2021-03-25'})
    assert.equal(client.config().apiVersion, '2021-03-25')
  })

  it('uses the default API version when none is configured', () => {
    assert.equal(createQueryClient(base).config().apiVersion, DEFAULT_API_VERSION.slice(1))
  })

  it('falls back to the default API version when the configured one is invalid', () => {
    const client = createQueryClient({...base, apiVersion: 'latest'})
    assert.equal(client.config().apiVersion, DEFAULT_API_VERSION.slice(1))
  })
})
