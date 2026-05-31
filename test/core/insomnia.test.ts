import { describe, expect, it } from 'vitest'
import { importInsomnia } from '../../src/core/import/insomnia'

const doc = {
  _type: 'export',
  __export_format: 4,
  resources: [
    { _type: 'request_group', _id: 'grp1', parentId: 'wrk', name: 'Auth' },
    { _type: 'request_group', _id: 'grp2', parentId: 'grp1', name: 'Login' },
    {
      _type: 'request',
      _id: 'req1',
      parentId: 'grp2',
      name: 'Sign in',
      method: 'POST',
      url: 'https://api.test/login',
      headers: [{ name: 'Accept', value: 'application/json' }],
      parameters: [{ name: 'next', value: '/home', disabled: true }],
      body: { mimeType: 'application/json', text: '{"u":"a"}' }
    },
    { _type: 'request', _id: 'req2', parentId: 'wrk', name: 'Ping', method: 'GET', url: 'https://api.test/ping' }
  ]
}

describe('importInsomnia', () => {
  it('rebuilds nested folder paths from the parent chain', () => {
    const result = importInsomnia(doc)
    expect(result.source).toBe('insomnia')
    const signin = result.requests.find((r) => r.request.name === 'Sign in')!
    expect(signin.path).toEqual(['Auth', 'Login'])
  })

  it('maps method, headers, disabled params and a json body', () => {
    const signin = importInsomnia(doc).requests.find((r) => r.request.name === 'Sign in')!
    expect(signin.request.method).toBe('post')
    expect(signin.request.headers).toEqual([
      { name: 'Accept', value: 'application/json', enabled: true }
    ])
    expect(signin.request.query).toEqual([{ name: 'next', value: '/home', enabled: false }])
    expect(signin.request.body).toEqual({ type: 'json', content: '{"u":"a"}' })
  })

  it('places top-level requests at the root', () => {
    const ping = importInsomnia(doc).requests.find((r) => r.request.name === 'Ping')!
    expect(ping.path).toEqual([])
  })
})
