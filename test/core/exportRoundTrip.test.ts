import { describe, expect, it } from 'vitest'
import { exportPostman } from '../../src/core/export'
import { importPostman, type ImportResult } from '../../src/core/import'
import type { ImportedRequest } from '../../src/core/import/types'
import type { TigerRequest } from '../../src/core/types'

const request = (name: string, extra: Partial<TigerRequest> = {}): TigerRequest => ({
  name,
  method: 'get',
  url: `https://api.test/${name.toLowerCase().replace(/\s+/g, '-')}`,
  headers: [],
  query: [],
  body: { type: 'none', content: '' },
  ...extra
})

const roundTrip = (...args: Parameters<typeof exportPostman>): ImportResult =>
  importPostman(JSON.parse(JSON.stringify(exportPostman(...args))))

const find = (result: ImportResult, name: string) => {
  const found = result.requests.find((r) => r.request.name === name)
  if (!found) throw new Error(`no request ${name}`)
  return found.request
}

describe('Postman export, then import again', () => {
  const requests: ImportedRequest[] = [
    {
      path: ['Users'],
      request: request('Create user', {
        method: 'post',
        auth: { type: 'bearer', token: '{{adminToken}}' },
        body: { type: 'json', content: '{"name":"Ada"}' },
        docs: 'Creates a user.',
        preScript: "pm.variables.set('started', Date.now())",
        postScript: 'pm.test("created", function () {\n  pm.response.to.have.status(201)\n})'
      })
    },
    { path: ['Users'], request: request('Public', { auth: { type: 'none' } }) },
    { path: ['Users'], request: request('Basic', { auth: { type: 'basic', username: 'ada', password: '{{pw}}' } }) },
    { path: ['Keys'], request: request('Key in query', { auth: { type: 'apikey', key: 'api_key', value: '{{k}}', in: 'query' } }) },
    {
      path: ['Keys'],
      request: request('Client credentials', {
        auth: {
          type: 'oauth2',
          grantType: 'client_credentials',
          tokenUrl: 'https://auth.test/token',
          clientId: '{{clientId}}',
          clientSecret: '{{clientSecret}}',
          scope: 'read write'
        }
      })
    },
    {
      path: [],
      request: request('Upload', {
        method: 'post',
        body: { type: 'multipart', content: 'title: Holiday\nphoto: @file:/Users/ada/cat.png\n~draft: true' }
      })
    },
    { path: [], request: request('Search', { url: 'https://api.test/search?q=lamp', query: [{ name: 'page', value: '2', enabled: true }] }) }
  ]

  it('keeps each request\'s auth, scripts and docs', () => {
    const again = roundTrip('Shop', requests, null)
    for (const { request: before } of requests) {
      const after = find(again, before.name)
      expect([after.name, after.auth, after.docs, after.preScript, after.postScript]).toEqual([
        before.name,
        before.auth,
        before.docs,
        before.preScript,
        before.postScript
      ])
    }
  })

  it('keeps a multipart body, its files and its disabled fields', () => {
    expect(find(roundTrip('Shop', requests, null), 'Upload').body).toEqual({
      type: 'multipart',
      content: 'title: Holiday\nphoto: @file:/Users/ada/cat.png\n~draft: true'
    })
  })

  it('keeps a query written in the URL as well as the params table', () => {
    const search = find(roundTrip('Shop', requests, null), 'Search')
    expect(search.query).toEqual([
      { name: 'q', value: 'lamp', enabled: true },
      { name: 'page', value: '2', enabled: true }
    ])
    expect(search.url).toBe('https://api.test/search')
  })

  it('keeps the collection and folder auth and docs it is given', () => {
    const again = roundTrip('Shop', requests, null, {
      auth: { type: 'bearer', token: '{{token}}' },
      docs: '# Shop API',
      folders: [
        { path: ['Users'], auth: { type: 'basic', username: 'admin', password: '{{adminPass}}' }, docs: 'User endpoints' },
        { path: ['Keys'], auth: { type: 'none' } },
        { path: ['Empty folder'], docs: 'Nothing here yet' }
      ]
    })
    expect(again.auth).toEqual({ type: 'bearer', token: '{{token}}' })
    expect(again.docs).toBe('# Shop API')
    expect(again.folders).toEqual([
      { path: ['Users'], auth: { type: 'basic', username: 'admin', password: '{{adminPass}}' }, docs: 'User endpoints' },
      { path: ['Keys'], auth: { type: 'none' } },
      { path: ['Empty folder'], docs: 'Nothing here yet' }
    ])
  })
})

describe('Postman export of the environment', () => {
  it('leaves secret values out of the shareable file, keeping their names', () => {
    const exported = exportPostman('Shop', [], {
      name: 'Staging',
      variables: [
        { name: 'baseUrl', value: 'https://staging.test', enabled: true },
        { name: 'token', value: 'live-secret-token', enabled: true, secret: true }
      ]
    }) as { variable: unknown[] }
    expect(JSON.stringify(exported)).not.toContain('live-secret-token')
    expect(exported.variable).toEqual([
      { key: 'baseUrl', value: 'https://staging.test' },
      { key: 'token', value: '', type: 'secret' }
    ])
  })
})
