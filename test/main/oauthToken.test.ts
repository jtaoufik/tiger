import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchMock = vi.fn()
vi.mock('electron', () => ({
  net: { fetch: (...args: unknown[]) => fetchMock(...args) },
  session: { defaultSession: {} }
}))
vi.mock('../../src/main/settings', () => ({
  loadSettings: () => ({ cookieJarEnabled: false })
}))
vi.mock('../../src/main/cookieJar', () => ({
  cookieHeaderFor: () => '',
  storeCookies: () => undefined
}))

import { forgetOAuthToken, getOAuthToken } from '../../src/main/http'

const auth = {
  type: 'oauth2' as const,
  grantType: 'client_credentials' as const,
  tokenUrl: '{{auth}}/token',
  clientId: 'tiger',
  clientSecret: '{{secret}}',
  scope: ''
}

function tokenResponse(body: Record<string, unknown>) {
  return { ok: true, status: 200, json: async () => body }
}

describe('getOAuthToken', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.useRealTimers()
  })

  it('asks the token endpoint once, then reuses the token until it expires', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(tokenResponse({ access_token: 'one', expires_in: 3600 }))
    const vars = { auth: 'https://login.test/a1', secret: 's1' }

    expect(await getOAuthToken(auth, vars)).toBe('one')
    expect(await getOAuthToken(auth, vars)).toBe('one')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://login.test/a1/token')

    // Renewed 30 s before the server's expiry.
    vi.advanceTimersByTime(3600_000 - 29_000)
    fetchMock.mockResolvedValue(tokenResponse({ access_token: 'two', expires_in: 3600 }))
    expect(await getOAuthToken(auth, vars)).toBe('two')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keys the cache on the resolved values, so another environment gets its own token', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse({ access_token: 'dev-token' }))
    fetchMock.mockResolvedValueOnce(tokenResponse({ access_token: 'staging-token' }))
    expect(await getOAuthToken(auth, { auth: 'https://login.test/a2', secret: 'dev' })).toBe('dev-token')
    expect(await getOAuthToken(auth, { auth: 'https://login.test/a2', secret: 'staging' })).toBe(
      'staging-token'
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('forgets a token the API refused, so the next call asks again', async () => {
    const vars = { auth: 'https://login.test/a3', secret: 's' }
    fetchMock.mockResolvedValueOnce(tokenResponse({ access_token: 'revoked' }))
    fetchMock.mockResolvedValueOnce(tokenResponse({ access_token: 'fresh' }))
    expect(await getOAuthToken(auth, vars)).toBe('revoked')
    forgetOAuthToken(auth, vars)
    expect(await getOAuthToken(auth, vars)).toBe('fresh')
  })

  it('never caches a failed exchange', async () => {
    const vars = { auth: 'https://login.test/a4', secret: 's' }
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
    await expect(getOAuthToken(auth, vars)).rejects.toThrow()
    fetchMock.mockResolvedValueOnce(tokenResponse({ access_token: 'ok' }))
    expect(await getOAuthToken(auth, vars)).toBe('ok')
  })
})
