import { describe, expect, it } from 'vitest'
import { buildRequest } from '../../src/core/request'
import type { TigerAuth, TigerRequest } from '../../src/core/types'

function req(partial: Partial<TigerRequest>): TigerRequest {
  return {
    name: 'r',
    method: 'get',
    url: 'https://api.test/things',
    query: [],
    headers: [],
    body: { type: 'none', content: '' },
    ...partial
  }
}

describe('buildRequest', () => {
  it('uppercases the method', () => {
    expect(buildRequest(req({ method: 'post' })).method).toBe('POST')
  })

  it('interpolates url, headers and query from vars', () => {
    const built = buildRequest(
      req({
        url: '{{base}}/users',
        query: [{ name: 'id', value: '{{id}}', enabled: true }],
        headers: [{ name: 'Authorization', value: 'Bearer {{token}}', enabled: true }]
      }),
      { base: 'https://api.test', id: '7', token: 'abc' }
    )
    expect(built.url).toBe('https://api.test/users?id=7')
    expect(built.headers.Authorization).toBe('Bearer abc')
  })

  it('url-encodes query values and appends with & when a query already exists', () => {
    const built = buildRequest(
      req({ url: 'https://api.test/s?x=1', query: [{ name: 'q', value: 'a b', enabled: true }] })
    )
    expect(built.url).toBe('https://api.test/s?x=1&q=a%20b')
  })

  it('skips disabled headers and query params', () => {
    const built = buildRequest(
      req({
        headers: [{ name: 'X-Off', value: '1', enabled: false }],
        query: [{ name: 'off', value: '1', enabled: false }]
      })
    )
    expect(built.headers['X-Off']).toBeUndefined()
    expect(built.url).not.toContain('off')
  })

  it('adds a JSON content-type and body for write methods', () => {
    const built = buildRequest(
      req({ method: 'post', body: { type: 'json', content: '{"a":1}' } })
    )
    expect(built.headers['Content-Type']).toBe('application/json')
    expect(built.body).toBe('{"a":1}')
  })

  it('does not override an explicit content-type', () => {
    const built = buildRequest(
      req({
        method: 'post',
        headers: [{ name: 'Content-Type', value: 'application/vnd.api+json', enabled: true }],
        body: { type: 'json', content: '{}' }
      })
    )
    expect(built.headers['Content-Type']).toBe('application/vnd.api+json')
  })

  it('drops the body on GET/HEAD', () => {
    expect(buildRequest(req({ method: 'get', body: { type: 'json', content: '{}' } })).body).toBeUndefined()
  })

  it('sends xml bodies with a text/xml content type (SOAP)', () => {
    const built = buildRequest(
      req({
        method: 'post',
        body: { type: 'xml', content: '<soap:Envelope><soap:Body/></soap:Envelope>' }
      })
    )
    expect(built.headers['Content-Type']).toBe('text/xml')
    expect(built.body).toContain('soap:Envelope')
  })

  it('url-encodes a form body', () => {
    const built = buildRequest(
      req({ method: 'post', body: { type: 'form', content: 'name: Ada Lovelace\nrole: pioneer' } })
    )
    expect(built.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(built.body).toBe('name=Ada+Lovelace&role=pioneer')
  })

  it('a request header overrides an auth header case-insensitively (single value)', () => {
    const auth: TigerAuth = { type: 'bearer', token: 'auth-token' }
    const built = buildRequest(
      req({
        auth,
        // lowercase 'authorization' must replace the auth block's 'Authorization'.
        headers: [{ name: 'authorization', value: 'Bearer override', enabled: true }]
      })
    )
    const authKeys = Object.keys(built.headers).filter(
      (k) => k.toLowerCase() === 'authorization'
    )
    expect(authKeys).toEqual(['authorization'])
    expect(built.headers.authorization).toBe('Bearer override')
    expect(built.headers.Authorization).toBeUndefined()
  })

  it('appends query params before a #fragment, keeping the fragment last', () => {
    const built = buildRequest(
      req({ url: 'https://x.com/p#frag', query: [{ name: 'a', value: '1', enabled: true }] })
    )
    expect(built.url).toBe('https://x.com/p?a=1#frag')
  })

  it('merges into an existing query and preserves the fragment', () => {
    const built = buildRequest(
      req({ url: 'https://x.com/p?x=1#frag', query: [{ name: 'a', value: '2', enabled: true }] })
    )
    expect(built.url).toBe('https://x.com/p?x=1&a=2#frag')
  })
})
