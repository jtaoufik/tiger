import { describe, expect, it } from 'vitest'
import { importBrunoRequest, importPostman } from '../../src/core/import'

describe('importPostman', () => {
  const collection = {
    info: { name: 'Sample API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/' },
    item: [
      {
        name: 'Users',
        item: [
          {
            name: 'Get user',
            request: {
              method: 'GET',
              header: [
                { key: 'Accept', value: 'application/json' },
                { key: 'X-Debug', value: '1', disabled: true }
              ],
              url: {
                raw: 'https://api.test/users/1?expand=profile',
                query: [{ key: 'expand', value: 'profile' }]
              }
            }
          },
          {
            name: 'Create user',
            request: {
              method: 'POST',
              header: [],
              url: 'https://api.test/users',
              body: {
                mode: 'raw',
                raw: '{"name":"Ada"}',
                options: { raw: { language: 'json' } }
              }
            }
          }
        ]
      }
    ]
  }

  it('reads the collection name and source', () => {
    const result = importPostman(collection)
    expect(result.name).toBe('Sample API')
    expect(result.source).toBe('postman')
  })

  it('flattens folders into request paths', () => {
    const result = importPostman(collection)
    expect(result.requests.map((r) => r.path)).toEqual([['Users'], ['Users']])
  })

  it('maps method, url, headers and query', () => {
    const [get] = importPostman(collection).requests
    expect(get.request.method).toBe('get')
    expect(get.request.url).toBe('https://api.test/users/1')
    expect(get.request.query).toEqual([{ name: 'expand', value: 'profile', enabled: true }])
    expect(get.request.headers).toEqual([
      { name: 'Accept', value: 'application/json', enabled: true },
      { name: 'X-Debug', value: '1', enabled: false }
    ])
  })

  it('maps a raw JSON body and a string url', () => {
    const post = importPostman(collection).requests[1]
    expect(post.request.url).toBe('https://api.test/users')
    expect(post.request.body).toEqual({ type: 'json', content: '{"name":"Ada"}' })
  })

  it('does not crash on an empty or malformed collection', () => {
    expect(importPostman({}).requests).toEqual([])
    expect(importPostman(null).name).toBe('Imported collection')
  })
})

describe('importBrunoRequest', () => {
  const bru = `
meta {
  name: Get user
  type: http
  seq: 3
}

get {
  url: {{baseUrl}}/users/1
  body: none
  auth: none
}

headers {
  Accept: application/json
  ~X-Debug: 1
}

body:json {
  { "ok": true }
}
`

  it('maps meta, method and url, ignoring body/auth selectors', () => {
    const { request } = importBrunoRequest(bru)
    expect(request.name).toBe('Get user')
    expect(request.seq).toBe(3)
    expect(request.method).toBe('get')
    expect(request.url).toBe('{{baseUrl}}/users/1')
  })

  it('maps headers with disabled markers', () => {
    const { request } = importBrunoRequest(bru)
    expect(request.headers).toEqual([
      { name: 'Accept', value: 'application/json', enabled: true },
      { name: 'X-Debug', value: '1', enabled: false }
    ])
  })

  it('maps a json body', () => {
    const { request } = importBrunoRequest(bru)
    expect(request.body).toEqual({ type: 'json', content: '{ "ok": true }' })
  })

  it('maps a Bruno form-urlencoded body to a form body', () => {
    const formBru = `
meta { name: F\n  seq: 1 }
post {
  url: x
}
body:form-urlencoded {
  grant_type: client_credentials
  ~scope: read
}
`
    const { request } = importBrunoRequest(formBru)
    expect(request.body.type).toBe('form')
    expect(request.body.content).toBe('grant_type: client_credentials\n~scope: read')
  })

  it('carries the folder path through', () => {
    expect(importBrunoRequest(bru, ['Users']).path).toEqual(['Users'])
  })
})
