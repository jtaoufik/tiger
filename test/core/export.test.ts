import { describe, expect, it } from 'vitest'
import { exportPostman } from '../../src/core/export'
import { importPostman } from '../../src/core/import'
import type { ImportedRequest } from '../../src/core/import/types'

const requests: ImportedRequest[] = [
  {
    path: ['Users'],
    request: {
      name: 'Get user',
      method: 'get',
      url: 'https://api.test/users/1',
      query: [{ name: 'expand', value: 'profile', enabled: true }],
      headers: [{ name: 'Accept', value: 'application/json', enabled: true }],
      body: { type: 'none', content: '' }
    }
  },
  {
    path: ['Users'],
    request: {
      name: 'Create user',
      method: 'post',
      url: 'https://api.test/users',
      query: [],
      headers: [],
      body: { type: 'json', content: '{"name":"Ada"}' }
    }
  }
]

describe('exportPostman', () => {
  it('produces a v2.1 collection with nested folders', () => {
    const collection = exportPostman('My API', requests) as any
    expect(collection.info.name).toBe('My API')
    expect(collection.info.schema).toContain('v2.1.0')
    expect(collection.item).toHaveLength(1)
    expect(collection.item[0].name).toBe('Users')
    expect(collection.item[0].item).toHaveLength(2)
  })

  it('round-trips back through the Postman importer', () => {
    const collection = exportPostman('My API', requests)
    const reimported = importPostman(collection)
    expect(reimported.requests).toHaveLength(2)
    expect(reimported.requests[0].request.method).toBe('get')
    expect(reimported.requests[0].request.url).toBe('https://api.test/users/1')
    expect(reimported.requests[1].request.body).toEqual({ type: 'json', content: '{"name":"Ada"}' })
  })

  it('merges query params into a URL that already has a "?" (no double ?)', () => {
    const collection = exportPostman('Q', [
      {
        path: [],
        request: {
          name: 'Search',
          method: 'get',
          url: 'https://api.test/s?x=1',
          query: [{ name: 'q', value: 'a', enabled: true }],
          headers: [],
          body: { type: 'none', content: '' }
        }
      }
    ]) as any
    const raw = collection.item[0].request.url.raw
    expect(raw).toBe('https://api.test/s?x=1&q=a')
    expect(raw.split('?')).toHaveLength(2)
  })

  it('exports an xml body as raw with language xml', () => {
    const collection = exportPostman('X', [
      {
        path: [],
        request: {
          name: 'Soap',
          method: 'post',
          url: 'https://api.test/soap',
          query: [],
          headers: [],
          body: { type: 'xml', content: '<a/>' }
        }
      }
    ]) as any
    expect(collection.item[0].request.body).toEqual({
      mode: 'raw',
      raw: '<a/>',
      options: { raw: { language: 'xml' } }
    })
  })

  it('exports a graphql body as mode graphql with query and variables', () => {
    const collection = exportPostman('G', [
      {
        path: [],
        request: {
          name: 'Gql',
          method: 'post',
          url: 'https://api.test/graphql',
          query: [],
          headers: [],
          body: { type: 'graphql', content: '{ me { id } }', variables: '{"id":1}' }
        }
      }
    ]) as any
    expect(collection.item[0].request.body).toEqual({
      mode: 'graphql',
      graphql: { query: '{ me { id } }', variables: '{"id":1}' }
    })
  })

  it('round-trips a graphql body back through the Postman importer', () => {
    const reqs: ImportedRequest[] = [
      {
        path: [],
        request: {
          name: 'Gql',
          method: 'post',
          url: 'https://api.test/graphql',
          query: [],
          headers: [],
          body: { type: 'graphql', content: '{ me { id } }', variables: '{"id":1}' }
        }
      }
    ]
    const reimported = importPostman(exportPostman('G', reqs))
    expect(reimported.requests[0].request.body).toEqual({
      type: 'graphql',
      content: '{ me { id } }',
      variables: '{"id":1}'
    })
  })
})

import { exportPostmanEnvironment } from '../../src/core/export'
import type { TigerEnvironment } from '../../src/core/types'

describe('environment export', () => {
  const env: TigerEnvironment = {
    name: 'staging',
    variables: [
      { name: 'baseUrl', value: 'https://api.test', enabled: true },
      { name: 'token', value: 'hush', enabled: true, secret: true }
    ]
  }

  it('exports a Postman environment file', () => {
    const out = exportPostmanEnvironment(env) as any
    expect(out.name).toBe('staging')
    expect(out._postman_variable_scope).toBe('environment')
    expect(out.values).toContainEqual({ key: 'token', value: 'hush', type: 'secret', enabled: true })
  })

  it('embeds the active environment as collection variables', () => {
    const out = exportPostman('My API', [], env) as any
    expect(out.variable).toContainEqual({ key: 'baseUrl', value: 'https://api.test' })
  })
})
