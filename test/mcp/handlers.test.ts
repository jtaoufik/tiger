import { describe, expect, it, vi } from 'vitest'
import {
  handleGetRequest,
  handleListEnvironments,
  handleListRequests,
  handleRunRequest,
  type CollectionStore,
  type HttpRunner
} from '../../src/mcp/handlers'
import type { BuiltRequest } from '../../src/core/request'

const files: Record<string, string> = {
  'users/get.tiger': 'meta {\n  name: Get user\n  seq: 1\n}\nget {\n  url: {{baseUrl}}/users/1\n}',
  'bad.tiger': 'this is not a valid request',
  // A request with no auth of its own — should inherit the collection default.
  'inherit.tiger': 'meta {\n  name: Inherit\n}\nget {\n  url: https://api.test/me\n}',
  // A request whose own auth is oauth2 client-credentials.
  'oauth.tiger':
    'meta {\n  name: OAuth\n}\nget {\n  url: https://api.test/secure\n}\n' +
    'auth:oauth2 {\n  token_url: https://auth.test/token\n  client_id: id\n  client_secret: shh\n  scope: read\n}',
  // A request with literal secrets in every auth field.
  'secret.tiger':
    'meta {\n  name: Secret\n}\nget {\n  url: https://api.test/x\n}\n' +
    'auth:bearer {\n  token: super-secret-token\n}',
  // A request whose bearer token is a {{variable}} reference (must NOT redact).
  'var-secret.tiger':
    'meta {\n  name: VarSecret\n}\nget {\n  url: https://api.test/x\n}\n' +
    'auth:bearer {\n  token: {{apiToken}}\n}'
}

function makeStore(overrides: Partial<CollectionStore> = {}): CollectionStore {
  return {
    listRequests: async () => [{ name: 'Get user', path: 'users/get.tiger' }],
    readRequest: async (path) => {
      if (path in files) return files[path]
      throw new Error('file not found')
    },
    readCollectionAuth: async () => undefined,
    listEnvironments: async () => [{ name: 'dev', path: 'environments/dev.tiger' }],
    readEnvironment: async (name) =>
      name === 'dev'
        ? { name: 'dev', variables: [{ name: 'baseUrl', value: 'https://api.test', enabled: true }] }
        : null,
    ...overrides
  }
}

const store = makeStore()

function fakeRunner(): HttpRunner & { last?: BuiltRequest; tokenCalls: number } {
  const runner = {
    last: undefined as BuiltRequest | undefined,
    tokenCalls: 0,
    oauthToken: vi.fn(async () => {
      runner.tokenCalls++
      return 'exchanged-bearer'
    }),
    send: vi.fn(async (built: BuiltRequest) => {
      runner.last = built
      return {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: '{"id":1}',
        timeMs: 7
      }
    })
  }
  return runner
}

describe('handleListRequests', () => {
  it('returns the request list as JSON text', async () => {
    const result = await handleListRequests(store)
    expect(result.isError).toBeFalsy()
    expect(JSON.parse(result.content[0].text)).toEqual([
      { name: 'Get user', path: 'users/get.tiger' }
    ])
  })
})

describe('handleListEnvironments', () => {
  it('returns the environment list', async () => {
    const result = await handleListEnvironments(store)
    expect(JSON.parse(result.content[0].text)).toEqual([
      { name: 'dev', path: 'environments/dev.tiger' }
    ])
  })
})

describe('handleGetRequest', () => {
  it('returns the parsed request', async () => {
    const result = await handleGetRequest(store, 'users/get.tiger')
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      name: 'Get user',
      method: 'get',
      url: '{{baseUrl}}/users/1'
    })
  })

  it('reports an error for a missing file', async () => {
    const result = await handleGetRequest(store, 'nope.tiger')
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Could not read request')
  })

  it('redacts a literal bearer token', async () => {
    const result = await handleGetRequest(store, 'secret.tiger')
    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.auth).toEqual({ type: 'bearer', token: '***' })
    expect(result.content[0].text).not.toContain('super-secret-token')
  })

  it('redacts literal basic password / apikey value / oauth2 client_secret', async () => {
    const basic = JSON.parse(
      (
        await handleGetRequest(
          makeStore({
            readRequest: async () =>
              'get {\n  url: https://x/y\n}\nauth:basic {\n  username: bob\n  password: hunter2\n}'
          }),
          'x'
        )
      ).content[0].text
    )
    expect(basic.auth).toEqual({ type: 'basic', username: 'bob', password: '***' })

    const apikey = JSON.parse(
      (
        await handleGetRequest(
          makeStore({
            readRequest: async () =>
              'get {\n  url: https://x/y\n}\nauth:apikey {\n  key: X-Key\n  value: live-key\n  in: header\n}'
          }),
          'x'
        )
      ).content[0].text
    )
    expect(apikey.auth).toMatchObject({ type: 'apikey', key: 'X-Key', value: '***' })

    const oauth = JSON.parse(
      (await handleGetRequest(makeStore(), 'oauth.tiger')).content[0].text
    )
    expect(oauth.auth).toMatchObject({ type: 'oauth2', clientId: 'id', clientSecret: '***' })
  })

  it('leaves {{variable}} secret references unredacted', async () => {
    const result = await handleGetRequest(store, 'var-secret.tiger')
    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.auth).toEqual({ type: 'bearer', token: '{{apiToken}}' })
  })

  it('sanitizes absolute paths out of error messages', async () => {
    const result = await handleGetRequest(
      makeStore({
        readRequest: async () => {
          throw new Error("ENOENT: no such file '/Users/me/coll/secret.tiger'")
        }
      }),
      'secret.tiger'
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).not.toContain('/Users/me/coll')
    expect(result.content[0].text).toContain('secret.tiger')
  })
})

describe('handleRunRequest', () => {
  it('interpolates the environment and runs the request', async () => {
    const runner = fakeRunner()
    const result = await handleRunRequest(store, runner, {
      path: 'users/get.tiger',
      environment: 'dev'
    })
    expect(runner.last?.url).toBe('https://api.test/users/1')
    const payload = JSON.parse(result.content[0].text)
    expect(payload.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(payload.environment).toBe('dev')
  })

  it('reports an error when the request cannot be parsed', async () => {
    const result = await handleRunRequest(store, fakeRunner(), { path: 'bad.tiger' })
    expect(result.isError).toBe(true)
  })

  it('reports an error when the runner throws', async () => {
    const runner: HttpRunner = {
      oauthToken: async () => 'unused',
      send: async () => {
        throw new Error('ECONNREFUSED')
      }
    }
    const result = await handleRunRequest(store, runner, { path: 'users/get.tiger' })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('ECONNREFUSED')
  })

  it('applies the collection default auth when the request has none', async () => {
    const runner = fakeRunner()
    const inheritStore = makeStore({
      readCollectionAuth: async () => ({ type: 'bearer', token: 'collection-tok' })
    })
    await handleRunRequest(inheritStore, runner, { path: 'inherit.tiger' })
    expect(runner.last?.headers.Authorization).toBe('Bearer collection-tok')
  })

  it('does not inherit when the collection has no default auth', async () => {
    const runner = fakeRunner()
    await handleRunRequest(store, runner, { path: 'inherit.tiger' })
    expect(runner.last?.headers.Authorization).toBeUndefined()
  })

  it('exchanges oauth2 for a bearer token before building the request', async () => {
    const runner = fakeRunner()
    const result = await handleRunRequest(store, runner, { path: 'oauth.tiger' })
    expect(runner.tokenCalls).toBe(1)
    expect(runner.last?.headers.Authorization).toBe('Bearer exchanged-bearer')
    // No raw oauth2 secrets ever reach the wire / echoed payload.
    expect(JSON.stringify(result)).not.toContain('shh')
  })

  it('inherits an oauth2 collection default and exchanges it', async () => {
    const runner = fakeRunner()
    const oauthStore = makeStore({
      readCollectionAuth: async () => ({
        type: 'oauth2',
        grantType: 'client_credentials',
        tokenUrl: 'https://auth.test/token',
        clientId: 'id',
        clientSecret: 'shh',
        scope: ''
      })
    })
    await handleRunRequest(oauthStore, runner, { path: 'inherit.tiger' })
    expect(runner.tokenCalls).toBe(1)
    expect(runner.last?.headers.Authorization).toBe('Bearer exchanged-bearer')
  })

  it('redacts an echoed Authorization response header', async () => {
    const runner = fakeRunner()
    runner.send = vi.fn(async (built: BuiltRequest) => {
      runner.last = built
      return {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json', Authorization: 'Bearer leak' },
        body: '{}',
        timeMs: 1
      }
    })
    const result = await handleRunRequest(store, runner, { path: 'users/get.tiger' })
    const payload = JSON.parse(result.content[0].text)
    const authHeader = payload.headers.find(
      (h: { name: string }) => h.name.toLowerCase() === 'authorization'
    )
    expect(authHeader.value).toBe('***')
    expect(result.content[0].text).not.toContain('Bearer leak')
  })

  it('sanitizes absolute paths out of run errors', async () => {
    const result = await handleRunRequest(
      makeStore({
        readRequest: async () => {
          throw new Error("ENOENT '/Users/me/coll/users/get.tiger'")
        }
      }),
      fakeRunner(),
      { path: 'users/get.tiger' }
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).not.toContain('/Users/me/coll')
    expect(result.content[0].text).toContain('get.tiger')
  })
})
