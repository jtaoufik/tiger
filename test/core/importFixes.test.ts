import { describe, expect, it } from 'vitest'
import { importBrunoRequest, importOpenApi, importPostman, importWsdl } from '../../src/core/import'
import { runScript } from '../../src/core/script'

const postmanRequest = (request: object, header: Array<{ key: string; value: string }> = []) =>
  importPostman({
    info: { name: 'Bodies', schema: 'https://schema.getpostman.com/json/collection/v2.0.0/collection.json' },
    item: [{ name: 'R', request: { method: 'POST', url: 'https://x.test/r', header, ...request } }]
  }).requests[0].request

describe('Postman raw body without options.raw.language (schema v2.0, older exports)', () => {
  it('follows the Content-Type header', () => {
    expect(postmanRequest({ body: { mode: 'raw', raw: '{"a":1}' } }, [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }]).body.type).toBe('json')
    expect(postmanRequest({ body: { mode: 'raw', raw: '<a/>' } }, [{ key: 'Content-Type', value: 'text/xml' }]).body.type).toBe('xml')
    // The header wins over the look of the text.
    expect(postmanRequest({ body: { mode: 'raw', raw: '{"a":1}' } }, [{ key: 'Content-Type', value: 'text/plain' }]).body.type).toBe('text')
  })

  it('sniffs the text when there is no header: JSON, XML, else text', () => {
    expect(postmanRequest({ body: { mode: 'raw', raw: ' {"a": [1, 2]}' } }).body.type).toBe('json')
    expect(postmanRequest({ body: { mode: 'raw', raw: '[1]' } }).body.type).toBe('json')
    expect(postmanRequest({ body: { mode: 'raw', raw: '<?xml version="1.0"?><a/>' } }).body.type).toBe('xml')
    expect(postmanRequest({ body: { mode: 'raw', raw: '{not json' } }).body.type).toBe('text')
    expect(postmanRequest({ body: { mode: 'raw', raw: 'hello' } }).body.type).toBe('text')
  })

  it('still trusts an explicit language', () => {
    expect(postmanRequest({ body: { mode: 'raw', raw: 'x', options: { raw: { language: 'json' } } } }).body.type).toBe('json')
  })
})

describe('Postman edge cases', () => {
  it('rebuilds a URL from parts when a path segment is a {type, value} object', () => {
    const req = postmanRequest({ url: { host: ['{{baseUrl}}'], path: ['users', { type: 'string', value: '42' }, 'orders'] } })
    expect(req.url).toBe('{{baseUrl}}/users/42/orders')
  })

  it('keeps a numeric item name instead of calling it Untitled', () => {
    const result = importPostman({
      info: { name: 'Years' },
      item: [{ name: 2024, item: [{ name: 1, request: { method: 'GET', url: 'https://x.test/2024' } }] }]
    })
    expect(result.requests.map((r) => [r.path, r.request.name])).toEqual([[['2024'], '1']])
  })
})

describe('OpenAPI edge cases', () => {
  it('samples a 3.1 nullable field from its non-null type', () => {
    const result = importOpenApi({
      openapi: '3.1.0',
      info: { title: 'Nullable' },
      servers: [{ url: 'https://api.test' }],
      paths: {
        '/x': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { name: { type: ['string', 'null'] }, count: { type: ['null', 'integer'] }, tags: { type: ['array', 'null'], items: { type: 'string' } } }
                  }
                }
              }
            }
          }
        }
      }
    })
    expect(JSON.parse(result.requests[0].request.body.content)).toEqual({ name: '', count: 0, tags: [''] })
  })

  it('reports a TRACE operation instead of dropping it quietly', () => {
    const result = importOpenApi({
      openapi: '3.0.0',
      info: { title: 'T' },
      servers: [{ url: 'https://api.test' }],
      paths: { '/x': { get: { summary: 'Get x' }, trace: { summary: 'Trace x' } } }
    })
    expect(result.requests.map((r) => r.request.name)).toEqual(['Get x'])
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ request: 'Trace x', i18n: { key: 'imports.methodUnsupported', vars: { method: 'TRACE' } } })
    )
  })
})

describe('WSDL that is not XML', () => {
  it('says the file is not a WSDL instead of importing nothing or throwing', () => {
    for (const text of ['{"openapi": "3.0.0"}', 'not xml at all', '<<<', '<html><body>404</body></html>']) {
      const result = importWsdl(text)
      expect(result.requests).toEqual([])
      expect(result.warnings?.map((w) => w.i18n?.key)).toEqual(['imports.notWsdl'])
    }
  })
})

describe('Bruno assertions and multipart file rows', () => {
  const bru = (blocks: string) =>
    importBrunoRequest(`meta {\n  name: R\n  type: http\n  seq: 1\n}\n\npost {\n  url: {{baseUrl}}/r\n  body: multipartForm\n  auth: inherit\n}\n\n${blocks}`)

  it('interpolates {{variables}} in an assertion value and compares as Bruno does (a number as a number)', () => {
    const { request } = bru('assert {\n  res.status: eq {{expectedStatus}}\n  res.body.id: eq {{id}}\n  res.body.name: eq {{name}}\n}\n')
    const run = (status: number, body: string) =>
      runScript(request.postScript!, { vars: { expectedStatus: '200', id: '7', name: 'Ada' }, response: { status, headers: [], body, timeMs: 1 } })
    expect(run(200, '{"id":7,"name":"Ada"}').tests.map((t) => t.passed)).toEqual([true, true, true])
    expect(run(404, '{"id":"7","name":"Bob"}').tests.map((t) => t.passed)).toEqual([false, false, false])
    expect(run(200, '{}').error).toBeUndefined()
  })

  it('keeps @file(path) @contentType(type) a file row, and says the type comes from the file name', () => {
    const warnings: never[] = []
    const { request } = importBrunoRequest(
      `meta {\n  name: Upload\n  type: http\n  seq: 1\n}\n\npost {\n  url: https://x.test/u\n  body: multipartForm\n}\n\nbody:multipart-form {\n  photo: @file(photos/a.png) @contentType(image/png)\n  plain: @file(b.txt)\n  caption: hi\n}\n`,
      [],
      warnings,
      (p) => `/col/${p}`
    )
    expect(request.body).toEqual({ type: 'multipart', content: 'photo: @file:/col/photos/a.png\nplain: @file:/col/b.txt\ncaption: hi' })
    expect((warnings as Array<{ i18n?: { key: string; vars?: object } }>).map((w) => w.i18n)).toContainEqual({
      key: 'imports.formFileContentType',
      vars: { field: 'photo', type: 'image/png' }
    })
  })
})
