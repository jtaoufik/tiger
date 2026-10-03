import { describe, expect, it } from 'vitest'
import { buildRequest, redactedUrl } from '../../src/core/request'
import { importPostman } from '../../src/core/import'
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

  it('sends a body set on a GET or HEAD (Elasticsearch-style search), never dropping it', () => {
    for (const method of ['get', 'head'] as const) {
      const built = buildRequest(req({ method, body: { type: 'json', content: '{"query":{"match_all":{}}}' } }))
      expect(built.body).toBe('{"query":{"match_all":{}}}')
      expect(built.headers['Content-Type']).toBe('application/json')
    }
  })

  it('adds nothing to a GET whose body type is set but holds nothing', () => {
    const built = buildRequest(req({ method: 'get', body: { type: 'json', content: '  \n' } }))
    expect(built.body).toBeUndefined()
    expect(built.headers['Content-Type']).toBeUndefined()
    expect(buildRequest(req({ method: 'get', body: { type: 'multipart', content: '~off: 1' } })).multipart).toBeUndefined()
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

describe('buildRequest: query encoding', () => {
  it('keeps percent-escapes a query value already holds (pasted, or imported from Postman)', () => {
    const built = buildRequest(
      req({
        url: 'https://auth.test/authorize',
        query: [
          { name: 'redirect_uri', value: 'https%3A%2F%2Fapp.test%2Fcb', enabled: true },
          { name: 'q', value: 'a%20b', enabled: true },
          { name: 'filter%5Bstatus%5D', value: 'open', enabled: true }
        ]
      })
    )
    expect(built.url).toBe('https://auth.test/authorize?redirect_uri=https%3A%2F%2Fapp.test%2Fcb&q=a%20b&filter%5Bstatus%5D=open')
  })

  it('still encodes what would change the query: spaces, & = # +, and a % that starts no escape', () => {
    const built = buildRequest(
      req({ query: [{ name: 'q', value: 'a b&c=d#e+f 100% %zz', enabled: true }] })
    )
    expect(built.url).toBe('https://api.test/things?q=a%20b%26c%3Dd%23e%2Bf%20100%25%20%25zz')
  })

  it('sends a Postman query value that is already encoded once, not twice', () => {
    const [{ request }] = importPostman({
      info: { name: 'OAuth', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/' },
      item: [
        {
          name: 'Authorize',
          request: {
            method: 'GET',
            url: {
              raw: 'https://auth.test/authorize?redirect_uri=https%3A%2F%2Fapp.test%2Fcb',
              query: [{ key: 'redirect_uri', value: 'https%3A%2F%2Fapp.test%2Fcb' }]
            }
          }
        }
      ]
    }).requests
    expect(buildRequest(request).url).toBe('https://auth.test/authorize?redirect_uri=https%3A%2F%2Fapp.test%2Fcb')
  })
})

describe('buildRequest: URL without a scheme', () => {
  it.each([
    ['127.0.0.1:3000/x', 'http://127.0.0.1:3000/x'],
    ['localhost:8080/x', 'http://localhost:8080/x'],
    ['api.test/x?a=1', 'http://api.test/x?a=1'],
    ['api.test', 'http://api.test'],
    ['[::1]:3000/x', 'http://[::1]:3000/x'],
    ['//api.test/x', 'http://api.test/x']
  ])('sends %s over http:// like Postman (%s)', (typed, sent) => {
    expect(buildRequest(req({ url: typed })).url).toBe(sent)
  })

  it('resolves variables first: {{host}}/x with host = api.test:8080 goes to http://api.test:8080/x', () => {
    expect(buildRequest(req({ url: '{{host}}/x' }), { host: 'api.test:8080' }).url).toBe('http://api.test:8080/x')
  })

  it.each(['https://api.test/x', 'HTTP://api.test/x', 'ws://api.test/x', '{{baseUrl}}/x', '/x', '', 'mailto:a@b.test'])(
    'leaves %s as written',
    (typed) => {
      expect(buildRequest(req({ url: typed })).url).toBe(typed)
    }
  )
})

describe('buildRequest: rows without a name', () => {
  it('skips a header or query row that has a value but no name', () => {
    const built = buildRequest(
      req({
        headers: [
          { name: '', value: 'typed first', enabled: true },
          { name: '{{unset}}', value: 'x', enabled: true },
          { name: 'X-Ok', value: '1', enabled: true }
        ],
        query: [
          { name: '', value: 'orphan', enabled: true },
          { name: ' ', value: 'blank', enabled: true },
          { name: 'page', value: '2', enabled: true }
        ]
      }),
      { unset: '' }
    )
    expect(built.headers).toEqual({ 'X-Ok': '1' })
    expect(built.url).toBe('https://api.test/things?page=2')
  })

  it('skips an API key auth whose key name is empty, in a header or in the query', () => {
    for (const where of ['header', 'query'] as const) {
      const built = buildRequest(req({ auth: { type: 'apikey', key: '', value: 'secret', in: where } }))
      expect(built.headers).toEqual({})
      expect(built.url).toBe('https://api.test/things')
    }
  })
})

describe('redactedUrl', () => {
  it('hides the value of an API key sent in the query string, for the history', () => {
    const built = buildRequest(
      req({
        query: [{ name: 'city', value: 'Paris', enabled: true }],
        auth: { type: 'apikey', key: 'api_key', value: '{{key}}', in: 'query' }
      }),
      { key: 's3cr3t' }
    )
    expect(built.url).toBe('https://api.test/things?city=Paris&api_key=s3cr3t')
    expect(redactedUrl(built)).toBe('https://api.test/things?city=Paris&api_key=***')
  })

  it('matches the encoded name and keeps the fragment', () => {
    const built = buildRequest(
      req({ url: 'https://api.test/x#top', auth: { type: 'apikey', key: 'api key', value: 'v', in: 'query' } })
    )
    expect(redactedUrl(built)).toBe('https://api.test/x?api%20key=***#top')
  })

  it('leaves a URL without auth query parameters as it is', () => {
    const built = buildRequest(req({ query: [{ name: 'api_key', value: 'typed', enabled: true }] }))
    expect(redactedUrl(built)).toBe(built.url)
    expect(redactedUrl({ method: 'GET', url: 'https://x.test/?a=1', headers: {} })).toBe('https://x.test/?a=1')
  })
})
