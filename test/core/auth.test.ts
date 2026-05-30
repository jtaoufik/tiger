import { describe, expect, it } from 'vitest'
import { applyAuth } from '../../src/core/auth'
import { buildRequest } from '../../src/core/request'
import { parseRequest, serializeRequest } from '../../src/core/tigerFormat'
import type { TigerAuth, TigerRequest } from '../../src/core/types'

function req(partial: Partial<TigerRequest>): TigerRequest {
  return {
    name: 'r',
    method: 'get',
    url: 'https://api.test/x',
    query: [],
    headers: [],
    body: { type: 'none', content: '' },
    ...partial
  }
}

describe('applyAuth', () => {
  it('returns nothing for none', () => {
    expect(applyAuth({ type: 'none' }, {})).toEqual({ headers: {}, query: [] })
  })

  it('builds a bearer header with interpolation', () => {
    expect(applyAuth({ type: 'bearer', token: '{{tok}}' }, { tok: 'abc' }).headers).toEqual({
      Authorization: 'Bearer abc'
    })
  })

  it('base64-encodes basic credentials', () => {
    expect(applyAuth({ type: 'basic', username: 'user', password: 'pass' }, {}).headers).toEqual({
      Authorization: 'Basic dXNlcjpwYXNz'
    })
  })

  it('puts an api key in the header or the query', () => {
    expect(
      applyAuth({ type: 'apikey', key: 'X-Key', value: 'v', in: 'header' }, {}).headers
    ).toEqual({ 'X-Key': 'v' })
    expect(applyAuth({ type: 'apikey', key: 'api_key', value: 'v', in: 'query' }, {}).query).toEqual(
      [{ name: 'api_key', value: 'v', enabled: true }]
    )
  })
})

describe('buildRequest with auth', () => {
  it('adds a bearer header', () => {
    const built = buildRequest(req({ auth: { type: 'bearer', token: 't' } }))
    expect(built.headers.Authorization).toBe('Bearer t')
  })

  it('adds an api key to the query string', () => {
    const built = buildRequest(
      req({ auth: { type: 'apikey', key: 'api_key', value: 'secret', in: 'query' } })
    )
    expect(built.url).toBe('https://api.test/x?api_key=secret')
  })

  it('lets an explicit Authorization header win over auth', () => {
    const built = buildRequest(
      req({
        headers: [{ name: 'Authorization', value: 'Bearer explicit', enabled: true }],
        auth: { type: 'bearer', token: 'fromauth' }
      })
    )
    expect(built.headers.Authorization).toBe('Bearer explicit')
  })
})

describe('auth round-trips through the .tiger format', () => {
  const cases: TigerAuth[] = [
    { type: 'bearer', token: '{{token}}' },
    { type: 'basic', username: 'u', password: 'p' },
    { type: 'apikey', key: 'X-Api-Key', value: '{{k}}', in: 'header' },
    {
      type: 'oauth2',
      grantType: 'client_credentials',
      tokenUrl: 'https://id.test/token',
      clientId: 'cid',
      clientSecret: 'csecret',
      scope: 'read write'
    }
  ]

  it.each(cases)('round-trips %o', (auth) => {
    const original = req({ method: 'post', auth })
    expect(parseRequest(serializeRequest(original)).auth).toEqual(auth)
  })

  it('omits the auth block when type is none', () => {
    expect(serializeRequest(req({}))).not.toContain('auth')
  })
})
