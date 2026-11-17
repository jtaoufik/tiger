import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyAuth } from '../../src/core/auth'
import { parseCollectionSettings } from '../../src/core/collectionSettings'
import { collectionFiles, uniqueName } from '../../src/core/collectionFiles'
import { exportOpenApi } from '../../src/core/export'
import { importOpenApi } from '../../src/core/import/openapi'
import { importPostman } from '../../src/core/import/postman'
import { assertionsToScript } from '../../src/core/import/bruno'
import { parseRequest, splitKeyValue } from '../../src/core/tigerFormat'
import { compareVersions, isNewerVersion } from '../../src/core/version'
import type { TigerRequest } from '../../src/core/types'

const req = (name: string, url: string, extra: Partial<TigerRequest> = {}): TigerRequest => ({
  name,
  method: 'get',
  url,
  query: [],
  headers: [],
  body: { type: 'none', content: '' },
  ...extra
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('.tiger format edges', () => {
  it('a line that starts with a quote but is not a JSON name is read as typed', () => {
    expect(splitKeyValue('"a\\q": v')).toEqual({ name: '"a\\q"', value: 'v' })
  })

  it('a body block without a subtype is text', () => {
    const r = parseRequest('meta {\n  name: x\n}\n\nget {\n  url: http://a.test\n}\n\nbody {\n  hello\n}\n')
    expect(r.body).toEqual({ type: 'text', content: 'hello' })
  })

  it('folder.tiger keeps a numeric seq and ignores one that is not a number', () => {
    expect(parseCollectionSettings('meta {\n  name: Users\n  seq: 3\n}\n')).toEqual({ name: 'Users', seq: 3 })
    expect(parseCollectionSettings('meta {\n  seq: soon\n}\n').seq).toBeUndefined()
  })
})

describe('basic auth without btoa (a plain Node process, the MCP server)', () => {
  it('encodes through Buffer to the same header', () => {
    const withBtoa = applyAuth({ type: 'basic', username: 'ana', password: 'päss' }, {}).headers.Authorization
    vi.stubGlobal('btoa', undefined)
    const withBuffer = applyAuth({ type: 'basic', username: 'ana', password: 'päss' }, {}).headers.Authorization
    expect(withBuffer).toBe(withBtoa)
    expect(withBuffer).toBe(`Basic ${Buffer.from('ana:päss', 'utf8').toString('base64')}`)
  })
})

describe('saving an imported collection', () => {
  it('names a clash with or without an extension', () => {
    const taken = new Set<string>()
    expect(uniqueName('Admin', taken)).toBe('Admin')
    expect(uniqueName('Admin', taken)).toBe('Admin 2')
    expect(uniqueName('Admin', taken, '.tiger')).toBe('Admin')
  })

  it('writes folder auth and docs into folder.tiger, and keeps a shown name the disk refuses', () => {
    const { files } = collectionFiles({
      name: 'Shop',
      requests: [
        { path: ['Store: front?'], request: req('List', 'http://a.test/list') },
        { path: ['Admin'], request: req('Stats', 'http://a.test/stats') }
      ],
      folders: [
        { path: [], docs: 'root docs are the collection docs, not a folder' },
        { path: ['Admin'], auth: { type: 'bearer', token: '{{t}}' }, docs: 'Admins only' }
      ]
    })
    const admin = files.find((f) => f.path === 'Admin/folder.tiger')!.content
    expect(admin).toContain('seq: 2')
    expect(admin).toContain('auth:bearer {')
    expect(admin).toContain('Admins only')
    expect(admin).not.toContain('name:')
    const store = files.find((f) => f.path === 'Store- front-/folder.tiger')!.content
    expect(store).toContain('name: Store: front?')
    expect(store).toContain('seq: 1')
  })
})

describe('OpenAPI export edges', () => {
  it('a URL without a path is "/", and two requests named alike get distinct operationIds', () => {
    const doc = exportOpenApi('Demo', [
      { path: [], request: req('Ping', '{{baseUrl}}') },
      { path: [], request: req('Ping', '{{baseUrl}}/other') }
    ]) as { paths: Record<string, Record<string, { operationId: string }>> }
    expect(Object.keys(doc.paths)).toEqual(['/', '/other'])
    expect(doc.paths['/'].get.operationId).toBe('Ping')
    expect(doc.paths['/other'].get.operationId).toBe('Ping_2')
  })
})

describe('OpenAPI import edges', () => {
  it('path-level keys that are not operations are neither imported nor reported', () => {
    const result = importOpenApi({
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      servers: [{ url: 'https://api.test' }],
      paths: {
        '/items': {
          summary: 'Items',
          parameters: [{ name: 'x', in: 'query', schema: { type: 'string' } }],
          get: { summary: 'List items' },
          trace: { summary: 'Trace items' }
        }
      }
    })
    expect(result.requests.map((r) => r.request.name)).toEqual(['List items'])
    expect(result.warnings?.filter((w) => w.request === 'Trace items')).toHaveLength(1)
    expect(result.warnings?.some((w) => /summary|parameters/.test(w.request ?? ''))).toBe(false)
  })

  it('a deep example body stops growing once its property budget is spent', () => {
    const wide = Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`p${i}`, { type: 'string' }]))
    const result = importOpenApi({
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {
        '/big': {
          post: {
            summary: 'Big',
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { inner: { type: 'object', properties: wide } } }
                }
              }
            }
          }
        }
      }
    })
    const body = JSON.parse(result.requests[0].request.body.content)
    expect(body).toEqual({ inner: {} })
  })
})

describe('Postman import edges', () => {
  it('a path given as one string, and an item without a name', () => {
    const result = importPostman({
      info: { name: 'C', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      item: [{ request: { method: 'GET', url: { protocol: 'https', host: ['api', 'test'], path: 'v1/items' } } }]
    })
    expect(result.requests[0].request.url).toBe('https://api.test/v1/items')
    expect(result.requests[0].request.name).toBe('Untitled')
  })
})

describe('Bruno assertions', () => {
  it('keep quoted strings and booleans as written, and an empty block gives no script', () => {
    const { script } = assertionsToScript('res.body.name: eq "Ana"\nres.body.ok: eq true')
    expect(script).toContain('expect(res.body.name).to.eql("Ana")')
    expect(script).toContain('expect(res.body.ok).to.eql(true)')
    expect(script).not.toContain('bruValue')
    expect(assertionsToScript('').script).toBeUndefined()
  })
})

describe('version precedence', () => {
  it('orders pre-release identifiers like semver', () => {
    expect(compareVersions('1.0.0-alpha.10', '1.0.0-alpha.2')).toBe(1)
    expect(compareVersions('1.0.0-alpha.beta', '1.0.0-alpha.1')).toBe(1)
    expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBe(-1)
    expect(compareVersions('1.0.0-beta', '1.0.0-alpha')).toBe(1)
    expect(isNewerVersion('1.0.0', '1.0.0-rc.1')).toBe(true)
  })
})
