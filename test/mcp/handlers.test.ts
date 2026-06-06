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
  'bad.tiger': 'this is not a valid request'
}

const store: CollectionStore = {
  listRequests: async () => [{ name: 'Get user', path: 'users/get.tiger' }],
  readRequest: async (path) => {
    if (path in files) return files[path]
    throw new Error('file not found')
  },
  listEnvironments: async () => [{ name: 'dev', path: 'environments/dev.tiger' }],
  readEnvironment: async (name) =>
    name === 'dev'
      ? { name: 'dev', variables: [{ name: 'baseUrl', value: 'https://api.test', enabled: true }] }
      : null
}

function fakeRunner(): HttpRunner & { last?: BuiltRequest } {
  const runner = {
    last: undefined as BuiltRequest | undefined,
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
      send: async () => {
        throw new Error('ECONNREFUSED')
      }
    }
    const result = await handleRunRequest(store, runner, { path: 'users/get.tiger' })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('ECONNREFUSED')
  })
})
