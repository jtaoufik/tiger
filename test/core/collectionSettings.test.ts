import { describe, expect, it } from 'vitest'
import {
  parseCollectionSettings,
  serializeCollectionSettings,
  resolveAuth
} from '../../src/core/collectionSettings'
import type { TigerAuth, TigerRequest } from '../../src/core/types'

const bearer: TigerAuth = { type: 'bearer', token: '{{token}}' }

function req(auth?: TigerAuth): TigerRequest {
  return {
    name: 'r',
    method: 'get',
    url: 'x',
    query: [],
    headers: [],
    body: { type: 'none', content: '' },
    ...(auth ? { auth } : {})
  }
}

describe('parseCollectionSettings', () => {
  it('reads name and auth from a collection.tiger document', () => {
    const text = 'meta {\n  name: Payments API\n}\n\nauth:bearer {\n  token: {{token}}\n}\n'
    expect(parseCollectionSettings(text)).toEqual({ name: 'Payments API', auth: bearer })
  })

  it('returns empty settings for an empty document', () => {
    expect(parseCollectionSettings('')).toEqual({})
  })

  it('round-trips through serialize', () => {
    const settings = { name: 'Payments API', auth: bearer }
    expect(parseCollectionSettings(serializeCollectionSettings(settings))).toEqual(settings)
  })
})

describe('resolveAuth', () => {
  it('inherits collection auth when the request has none set', () => {
    expect(resolveAuth(req(), bearer)).toEqual(bearer)
  })

  it('lets a request auth override the collection auth', () => {
    const own: TigerAuth = { type: 'basic', username: 'u', password: 'p' }
    expect(resolveAuth(req(own), bearer)).toEqual(own)
  })

  it('respects an explicit none override (no inheritance)', () => {
    expect(resolveAuth(req({ type: 'none' }), bearer)).toEqual({ type: 'none' })
  })

  it('returns undefined when neither side has auth', () => {
    expect(resolveAuth(req(), undefined)).toBeUndefined()
  })
})

describe('collection/folder docs', () => {
  it('round-trips a docs block', () => {
    const settings = { name: 'API', docs: '# Payments\n\nHow to auth: bearer token.' }
    const out = serializeCollectionSettings(settings)
    expect(out).toContain('docs {')
    expect(parseCollectionSettings(out)).toEqual(settings)
  })

  it('round-trips name + auth + docs together', () => {
    const settings = {
      name: 'API',
      auth: { type: 'bearer', token: '{{token}}' } as const,
      docs: 'Notes about {{baseUrl}}.'
    }
    expect(parseCollectionSettings(serializeCollectionSettings(settings))).toEqual(settings)
  })
})
