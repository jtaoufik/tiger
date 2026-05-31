import { describe, expect, it } from 'vitest'
import { importOpenApi } from '../../src/core/import/openapi'

const doc = {
  openapi: '3.0.0',
  info: { title: 'Petstore' },
  servers: [{ url: 'https://api.test/v1' }],
  paths: {
    '/pets': {
      get: {
        summary: 'List pets',
        tags: ['Pets'],
        parameters: [{ name: 'limit', in: 'query', required: false, example: '10' }]
      },
      post: {
        operationId: 'createPet',
        tags: ['Pets'],
        requestBody: {
          content: { 'application/json': { example: { name: 'Rex' } } }
        }
      }
    }
  }
}

describe('importOpenApi', () => {
  it('reads the title and source', () => {
    const result = importOpenApi(doc)
    expect(result.name).toBe('Petstore')
    expect(result.source).toBe('openapi')
  })

  it('creates one request per operation, grouped by tag', () => {
    const result = importOpenApi(doc)
    expect(result.requests).toHaveLength(2)
    expect(result.requests.every((r) => r.path[0] === 'Pets')).toBe(true)
  })

  it('builds the URL from the server and path', () => {
    const [list] = importOpenApi(doc).requests
    expect(list.request.method).toBe('get')
    expect(list.request.url).toBe('https://api.test/v1/pets')
    expect(list.request.name).toBe('List pets')
    expect(list.request.query).toEqual([{ name: 'limit', value: '10', enabled: false }])
  })

  it('maps a JSON request body example', () => {
    const post = importOpenApi(doc).requests[1]
    expect(post.request.name).toBe('createPet')
    expect(post.request.body).toEqual({ type: 'json', content: '{\n  "name": "Rex"\n}' })
  })

  it('falls back to {{baseUrl}} without servers', () => {
    const [r] = importOpenApi({ paths: { '/x': { get: {} } } }).requests
    expect(r.request.url).toBe('{{baseUrl}}/x')
  })
})
