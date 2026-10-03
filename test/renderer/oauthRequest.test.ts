import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildRequest } from '../../src/core/request'
import { toCurl } from '../../src/core/codegen'
import {
  OAUTH_TOKEN_PLACEHOLDER,
  runRequest,
  withKnownOAuthToken,
  withOAuthToken
} from '../../src/renderer/src/runRequest'
import type { TigerRequest } from '../../src/core/types'

const request = (tokenUrl: string): TigerRequest => ({
  name: 'Me',
  method: 'get',
  url: '{{base}}/me',
  query: [],
  headers: [],
  body: { type: 'none', content: '' },
  auth: {
    type: 'oauth2',
    grantType: 'client_credentials',
    tokenUrl,
    clientId: 'tiger',
    clientSecret: '{{secret}}',
    scope: ''
  }
})

const vars = { base: 'https://api.test', secret: 's3cret' }

describe('OAuth2 outside of Send', () => {
  let oauthToken: ReturnType<typeof vi.fn>
  let oauthForget: ReturnType<typeof vi.fn>
  let send: ReturnType<typeof vi.fn>

  beforeEach(() => {
    oauthToken = vi.fn(async () => 'tok-123')
    oauthForget = vi.fn(async () => undefined)
    send = vi.fn(async () => ({
      status: 200,
      statusText: 'OK',
      headers: {},
      body: '{}',
      timeMs: 1
    }))
    ;(window as unknown as { tiger: unknown }).tiger = { oauthToken, oauthForget, send }
  })
  afterEach(() => {
    delete (window as unknown as { tiger?: unknown }).tiger
  })

  it('copies a curl command that carries the bearer token, not nothing', async () => {
    const sent = await withOAuthToken(request('https://login.test/c1'), vars)
    const curl = toCurl(buildRequest(sent, vars))
    expect(curl).toContain('Authorization: Bearer tok-123')
    expect(oauthToken).toHaveBeenCalledTimes(1)
  })

  it('shows a placeholder in the Code tab until a token was obtained, then that token', async () => {
    const req = request('https://login.test/c2')
    const before = buildRequest(withKnownOAuthToken(req, vars), vars)
    expect(before.headers.Authorization).toBe(`Bearer ${OAUTH_TOKEN_PLACEHOLDER}`)
    expect(oauthToken).not.toHaveBeenCalled()

    await runRequest(req, { name: 'dev', variables: [] }, 1000)
    // runRequest got vars from an empty env, so key the lookup the same way.
    const after = buildRequest(withKnownOAuthToken(req, {}), {})
    expect(after.headers.Authorization).toBe('Bearer tok-123')
  })

  it('forgets the token when the API answers 401 with it', async () => {
    send.mockResolvedValueOnce({ status: 401, statusText: 'Unauthorized', headers: {}, body: '', timeMs: 1 })
    const req = request('https://login.test/c3')
    await runRequest(req, null, 1000)
    expect(oauthForget).toHaveBeenCalledTimes(1)
    expect(buildRequest(withKnownOAuthToken(req, {}), {}).headers.Authorization).toBe(
      `Bearer ${OAUTH_TOKEN_PLACEHOLDER}`
    )
  })

  it('leaves other auth types alone', async () => {
    const bearer: TigerRequest = { ...request('x'), auth: { type: 'bearer', token: 'b' } }
    expect(await withOAuthToken(bearer, vars)).toBe(bearer)
    expect(withKnownOAuthToken(bearer, vars)).toBe(bearer)
    expect(oauthToken).not.toHaveBeenCalled()
  })
})
