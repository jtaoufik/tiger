import { describe, expect, it } from 'vitest'
import { exportOpenApi } from '../../src/core/export'
import { importOpenApi } from '../../src/core/import/openapi'
import { envToVars, findMissingVars, interpolate } from '../../src/core/interpolate'
import type { TigerAuth, TigerRequest } from '../../src/core/types'

/** Every text a send interpolates: URL, query, headers, body and auth fields. */
function sentTexts(request: TigerRequest, collectionAuth?: TigerAuth): string[] {
  const auth = request.auth ?? collectionAuth
  return [
    request.url,
    ...request.query.map((q) => q.value),
    ...request.headers.map((h) => h.value),
    request.body.content,
    ...Object.values(auth ?? {}).filter((v): v is string => typeof v === 'string')
  ]
}

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
    const result = importOpenApi(doc)
    const [list] = result.requests
    expect(list.request.method).toBe('get')
    expect(interpolate(list.request.url, envToVars(result.environments?.[0]))).toBe('https://api.test/v1/pets')
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

describe('importOpenApi environments', () => {
  it('puts each server in its own environment and the requests on {{baseUrl}}', () => {
    const result = importOpenApi({
      ...doc,
      servers: [
        { url: 'https://api.test/v1', description: 'Production' },
        { url: 'https://staging.api.test/v1/', description: 'Staging' }
      ]
    })
    expect(result.requests[0].request.url).toBe('{{baseUrl}}/pets')
    expect(result.environments).toEqual([
      { name: 'Production', variables: [{ name: 'baseUrl', value: 'https://api.test/v1', enabled: true }] },
      { name: 'Staging', variables: [{ name: 'baseUrl', value: 'https://staging.api.test/v1', enabled: true }] }
    ])
  })

  it('keeps server variables such as {env} switchable in the environment', () => {
    const result = importOpenApi({
      paths: { '/pets': { get: {} } },
      servers: [
        {
          url: 'https://{env}.api.test/{version}',
          variables: { env: { default: 'prod', enum: ['dev', 'prod'] }, version: { default: 'v2' } }
        }
      ]
    })
    const [env] = result.environments!
    expect(env.variables).toContainEqual({ name: 'env', value: 'prod', enabled: true })
    expect(interpolate(result.requests[0].request.url, envToVars(env))).toBe('https://prod.api.test/v2/pets')
  })

  it('defines every variable the requests use, except path parameters', () => {
    const result = importOpenApi({
      openapi: '3.0.0',
      info: { title: 'Secured' },
      servers: [{ url: 'https://api.test' }],
      components: {
        securitySchemes: {
          bearer: { type: 'http', scheme: 'bearer' },
          key: { type: 'apiKey', name: 'X-Key', in: 'header' },
          basic: { type: 'http', scheme: 'basic' },
          cc: { type: 'oauth2', flows: { clientCredentials: { tokenUrl: 'https://auth.test/token', scopes: {} } } }
        }
      },
      security: [{ bearer: [] }],
      paths: {
        '/pets/{petId}': {
          get: { parameters: [{ name: 'petId', in: 'path', required: true }] },
          delete: { security: [{ key: [] }] },
          put: { security: [{ basic: [] }] },
          patch: { security: [{ cc: [] }] }
        }
      }
    })
    const vars = envToVars(result.environments?.[0])
    for (const { request } of result.requests) {
      const missing = sentTexts(request, result.auth).flatMap((t) => findMissingVars(t, vars))
      expect(missing.filter((name) => name !== 'petId')).toEqual([])
    }
  })

  it('asks for the host when the server URL is relative', () => {
    const result = importOpenApi({ paths: { '/pets': { get: {} } }, servers: [{ url: '/v1' }] })
    expect(result.requests[0].request.url).toBe('{{baseUrl}}/v1/pets')
    expect(result.environments?.[0].variables).toEqual([{ name: 'baseUrl', value: '', enabled: true }])
    expect(result.warnings?.some((w) => w.i18n?.key === 'imports.baseUrlUnknown')).toBe(true)
  })

  it('re-imports its own OpenAPI export: {{baseUrl}} stays a variable the user sets', () => {
    const exported = exportOpenApi('Shop', [
      {
        path: [],
        request: {
          name: 'List items',
          method: 'get',
          url: '{{baseUrl}}/items',
          headers: [],
          query: [],
          body: { type: 'none', content: '' }
        }
      }
    ])
    const result = importOpenApi(exported)
    expect(result.requests[0].request.url).toBe('{{baseUrl}}/items')
    expect(result.environments?.[0].variables).toContainEqual({ name: 'baseUrl', value: '', enabled: true })
    expect(result.warnings?.some((w) => w.i18n?.key === 'imports.baseUrlUnknown')).toBe(true)
  })

  it('keeps {{variables}} already in a server URL and defines them', () => {
    const result = importOpenApi({ paths: { '/x': { get: {} } }, servers: [{ url: 'https://{{host}}/v1' }] })
    const [env] = result.environments!
    expect(env.variables).toContainEqual({ name: 'baseUrl', value: 'https://{{host}}/v1', enabled: true })
    expect(env.variables).toContainEqual({ name: 'host', value: '', enabled: true })
  })

  it('maps a Swagger 2 host and base path to an environment', () => {
    const result = importOpenApi({ swagger: '2.0', host: 'api.test', basePath: '/v2', paths: { '/pets': { get: {} } } })
    expect(result.requests[0].request.url).toBe('{{baseUrl}}/pets')
    expect(result.environments).toEqual([
      { name: 'api.test', variables: [{ name: 'baseUrl', value: 'https://api.test/v2', enabled: true }] }
    ])
  })
})
