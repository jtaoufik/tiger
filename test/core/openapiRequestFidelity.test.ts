import { describe, expect, it } from 'vitest'
import { importOpenApi, layerCollectionVariables, type ImportResult } from '../../src/core/import'
import { envToVars } from '../../src/core/interpolate'
import { buildRequest } from '../../src/core/request'

const find = (result: ImportResult, name: string) => {
  const found = result.requests.find((r) => r.request.name === name)
  if (!found) throw new Error(`no request ${name}`)
  return found.request
}

/** What Send puts on the wire with the first environment, plus values the user filled in. */
const sent = (result: ImportResult, name: string, filled: Record<string, string> = {}) => {
  const request = find(result, name)
  const vars = { ...envToVars(layerCollectionVariables(result).environments?.[0]), ...filled }
  return buildRequest({ ...request, auth: request.auth ?? result.auth }, vars)
}

const contentType = (headers: Record<string, string>) =>
  Object.entries(headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1]

describe('OpenAPI header parameters named Authorization, Accept or Content-Type', () => {
  // springfox and springdoc document @RequestHeader("Authorization") this way.
  const shop = importOpenApi({
    openapi: '3.0.3',
    info: { title: 'Shop' },
    servers: [{ url: 'https://api.shop.test' }],
    security: [{ bearerAuth: [] }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
    paths: {
      '/users': {
        get: {
          summary: 'List users',
          parameters: [
            { name: 'Authorization', in: 'header', required: true, schema: { type: 'string' } },
            { name: 'Accept', in: 'header', required: true, schema: { type: 'string' } },
            { name: 'X-Tenant', in: 'header', required: true, schema: { type: 'string', example: 'acme' } }
          ]
        },
        post: {
          summary: 'Create user',
          parameters: [{ name: 'Content-Type', in: 'header', required: true, schema: { type: 'string' } }],
          requestBody: { content: { 'application/json': { example: { name: 'Ada' } } } }
        }
      }
    }
  })

  it('sends the token set in the environment, not an empty Authorization header', () => {
    const built = sent(shop, 'List users', { token: 'T0K3N' })
    expect(built.headers).toEqual({ Authorization: 'Bearer T0K3N', 'X-Tenant': 'acme' })
  })

  it('sends a JSON body as application/json, not with an empty Content-Type', () => {
    expect(contentType(sent(shop, 'Create user', { token: 't' }).headers)).toBe('application/json')
  })

  it('leaves them out in OpenAPI 3, which says to ignore them, and keeps other header params', () => {
    expect(find(shop, 'List users').headers).toEqual([{ name: 'X-Tenant', value: 'acme', enabled: true }])
    expect(find(shop, 'Create user').headers).toEqual([])
  })

  it('keeps them in Swagger 2 without letting an empty one replace the auth or the body type', () => {
    const legacy = importOpenApi({
      swagger: '2.0',
      info: { title: 'Legacy' },
      host: 'api.legacy.test',
      securityDefinitions: { key: { type: 'apiKey', in: 'header', name: 'X-Api-Key' } },
      security: [{ key: [] }],
      paths: {
        '/items': {
          post: {
            summary: 'Add item',
            parameters: [
              { name: 'Authorization', in: 'header', required: true, type: 'string', default: 'Bearer abc' },
              { name: 'X-Api-Key', in: 'header', required: true, type: 'string' },
              { name: 'Content-Type', in: 'header', required: true, type: 'string' },
              { name: 'Accept', in: 'header', required: true, type: 'string', default: 'application/xml' },
              { name: 'body', in: 'body', schema: { type: 'object', properties: { name: { type: 'string' } } } }
            ]
          }
        }
      }
    })
    const built = sent(legacy, 'Add item', { apiKey: 'k-123' })
    expect(built.headers['X-Api-Key']).toBe('k-123')
    expect(contentType(built.headers)).toBe('application/json')
    expect(built.headers.Accept).toBe('application/xml')
    expect(built.headers.Authorization).toBe('Bearer abc')
  })
})

describe('OpenAPI media types', () => {
  const spec = importOpenApi({
    openapi: '3.0.3',
    info: { title: 'Media' },
    servers: [{ url: 'https://api.test' }],
    paths: {
      '/users/{id}': {
        patch: {
          summary: 'Update user',
          requestBody: {
            content: {
              'application/json; charset=utf-8': {
                schema: { type: 'object', properties: { name: { type: 'string', example: 'Ada' } } }
              }
            }
          }
        }
      },
      '/orders': {
        post: {
          summary: 'Create order',
          requestBody: { content: { 'application/vnd.api+json': { example: { data: { type: 'orders' } } } } }
        }
      },
      '/feeds': {
        post: { summary: 'Post feed', requestBody: { content: { 'application/xml': { example: '<feed/>' } } } }
      },
      '/reports': {
        post: { summary: 'Upload report', requestBody: { content: { 'text/csv': { example: 'a,b\n1,2' } } } }
      },
      '/login': {
        post: {
          summary: 'Log in',
          requestBody: {
            content: {
              'application/x-www-form-urlencoded; charset=UTF-8': {
                schema: { type: 'object', properties: { user: { type: 'string', example: 'ada' } } }
              }
            }
          }
        }
      }
    }
  })

  it('keeps the body of application/json; charset=utf-8', () => {
    expect(find(spec, 'Update user').body).toEqual({ type: 'json', content: '{\n  "name": "Ada"\n}' })
    expect(contentType(sent(spec, 'Update user').headers)).toBe('application/json')
  })

  it('sends a vendor JSON type with its own Content-Type', () => {
    const built = sent(spec, 'Create order')
    expect(find(spec, 'Create order').body.type).toBe('json')
    expect(contentType(built.headers)).toBe('application/vnd.api+json')
  })

  it('sends application/xml and text/csv as declared, not as text/xml and text/plain', () => {
    expect(contentType(sent(spec, 'Post feed').headers)).toBe('application/xml')
    expect(sent(spec, 'Upload report').body).toBe('a,b\n1,2')
    expect(contentType(sent(spec, 'Upload report').headers)).toBe('text/csv')
  })

  it('reads a form body whose media type has a charset', () => {
    expect(find(spec, 'Log in').body).toEqual({ type: 'form', content: 'user: ada' })
  })
})

describe('OpenAPI security requirements', () => {
  const api = importOpenApi({
    openapi: '3.0.3',
    info: { title: 'Partners' },
    servers: [{ url: 'https://api.test' }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
        partnerKey: { type: 'apiKey', in: 'header', name: 'X-Partner-Key' },
        partnerId: { type: 'apiKey', in: 'header', name: 'X-Partner-Id' },
        session: { type: 'apiKey', in: 'cookie', name: 'SID' }
      }
    },
    paths: {
      '/auth/login': { post: { summary: 'Log in', security: [], requestBody: { content: { 'application/json': { example: {} } } } } },
      '/search': { get: { summary: 'Search', security: [{ partnerKey: [], partnerId: [] }] } },
      '/key-only': { get: { summary: 'Key only', security: [{ partnerId: [] }] } },
      '/both': { get: { summary: 'Token and key', security: [{ partnerId: [], bearerAuth: [] }] } },
      '/legacy': { get: { summary: 'Token and cookie', security: [{ bearerAuth: [], session: [] }] } },
      '/me': { get: { summary: 'Me' } }
    }
  })

  it('sends no credentials to an operation marked public with security: []', () => {
    expect(find(api, 'Log in').auth).toEqual({ type: 'none' })
    expect(sent(api, 'Log in', { token: 'T' }).headers.Authorization).toBeUndefined()
    expect(sent(api, 'Me', { token: 'T' }).headers.Authorization).toBe('Bearer T')
  })

  it('sends every API key a requirement asks for together, each with its own variable', () => {
    const built = sent(api, 'Search', { partnerKey: 'pk', partnerId: 'pid' })
    expect(built.headers).toEqual({ 'X-Partner-Key': 'pk', 'X-Partner-Id': 'pid' })
    // The same scheme uses the same variable in every operation.
    expect(sent(api, 'Key only', { partnerKey: 'pk', partnerId: 'pid' }).headers).toEqual({ 'X-Partner-Id': 'pid' })
  })

  it('sends a bearer token and an API key required together', () => {
    expect(sent(api, 'Token and key', { token: 'T', partnerId: 'pid' }).headers).toEqual({
      Authorization: 'Bearer T',
      'X-Partner-Id': 'pid'
    })
  })

  it('defines the variables of the extra keys in the environments', () => {
    const names = api.environments?.[0].variables.map((v) => v.name)
    expect(names).toEqual(expect.arrayContaining(['partnerKey', 'partnerId', 'token']))
  })

  it('says which required scheme Tiger could not add', () => {
    const note = api.warnings?.find((w) => w.request === 'Token and cookie' && w.i18n?.key === 'imports.securityPartial')
    expect(note?.message).toContain('session')
    expect(sent(api, 'Token and cookie', { token: 'T' }).headers.Authorization).toBe('Bearer T')
  })
})
