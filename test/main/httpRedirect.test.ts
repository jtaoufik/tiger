import { describe, it, expect, vi } from 'vitest'

// http.ts imports `electron` and `./settings` (also electron). Stub both so the
// pure redirect helpers can be imported and exercised without Electron.
vi.mock('electron', () => ({
  net: { fetch: vi.fn() },
  session: { defaultSession: {} }
}))
vi.mock('../../src/main/settings', () => ({
  loadSettings: () => ({ cookieJarEnabled: false })
}))
vi.mock('../../src/main/cookieJar', () => ({
  cookieHeaderFor: () => '',
  storeCookies: () => undefined
}))

import { sameOrigin, redirectHeaders, redirectMethodBody } from '../../src/main/http'

describe('sameOrigin', () => {
  it('matches scheme + host + port', () => {
    expect(sameOrigin('https://a.com/x', 'https://a.com/y')).toBe(true)
    expect(sameOrigin('https://a.com:443/x', 'https://a.com/y')).toBe(true)
  })

  it('differs on host, scheme, or port', () => {
    expect(sameOrigin('https://a.com/x', 'https://b.com/y')).toBe(false)
    expect(sameOrigin('http://a.com/x', 'https://a.com/y')).toBe(false)
    expect(sameOrigin('https://a.com:8443/x', 'https://a.com/y')).toBe(false)
  })

  it('is false for unparseable input', () => {
    expect(sameOrigin('not a url', 'https://a.com')).toBe(false)
  })
})

describe('redirectHeaders', () => {
  const headers = { Authorization: 'Bearer t', Cookie: 'a=1', 'X-Trace': 'keep' }

  it('keeps all headers on a same-origin redirect', () => {
    const out = redirectHeaders(headers, 'https://a.com/1', 'https://a.com/2')
    expect(out).toEqual(headers)
    // returns a copy, not the same reference
    expect(out).not.toBe(headers)
  })

  it('strips Authorization and Cookie on a cross-origin redirect', () => {
    const out = redirectHeaders(headers, 'https://a.com/1', 'https://evil.com/2')
    expect(out).toEqual({ 'X-Trace': 'keep' })
  })

  it('is case-insensitive about the stripped header names', () => {
    const out = redirectHeaders(
      { authorization: 'x', cookie: 'y', 'content-type': 'json' },
      'https://a.com',
      'https://b.com'
    )
    expect(out).toEqual({ 'content-type': 'json' })
  })
})

describe('redirectMethodBody', () => {
  it('303 always becomes GET and drops the body', () => {
    expect(redirectMethodBody(303, 'POST', 'data')).toEqual({ method: 'GET', body: undefined })
    expect(redirectMethodBody(303, 'PUT', 'data')).toEqual({ method: 'GET', body: undefined })
  })

  it('301/302 turn POST into GET and drop the body', () => {
    expect(redirectMethodBody(301, 'POST', 'data')).toEqual({ method: 'GET', body: undefined })
    expect(redirectMethodBody(302, 'POST', 'data')).toEqual({ method: 'GET', body: undefined })
  })

  it('301/302 preserve non-POST methods and their body', () => {
    expect(redirectMethodBody(301, 'GET', undefined)).toEqual({ method: 'GET', body: undefined })
    expect(redirectMethodBody(302, 'PUT', 'data')).toEqual({ method: 'PUT', body: 'data' })
  })

  it('307/308 preserve method and body', () => {
    expect(redirectMethodBody(307, 'POST', 'data')).toEqual({ method: 'POST', body: 'data' })
    expect(redirectMethodBody(308, 'POST', 'data')).toEqual({ method: 'POST', body: 'data' })
  })
})
