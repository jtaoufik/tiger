import { describe, expect, it } from 'vitest'
import { buildRequest } from '../../src/core/request'
import { parseRequest, serializeRequest } from '../../src/core/tigerFormat'
import { minifyJsonText } from '../../src/core/jsonHighlight'
import { importPostman } from '../../src/core/import'
import type { TigerRequest } from '../../src/core/types'

function req(partial: Partial<TigerRequest>): TigerRequest {
  return {
    name: 'r',
    method: 'post',
    url: 'https://api.test/graphql',
    query: [],
    headers: [],
    body: { type: 'none', content: '' },
    ...partial
  }
}

describe('buildRequest with a graphql body', () => {
  const query = 'query User($id: ID!) {\n  user(id: $id) { name }\n}'

  it('posts a JSON envelope of query + parsed variables', () => {
    const built = buildRequest(
      req({ body: { type: 'graphql', content: query, variables: '{ "id": "7" }' } })
    )
    expect(built.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(built.body!)).toEqual({ query, variables: { id: '7' } })
  })

  it('omits variables when the variables text is empty or invalid JSON', () => {
    const noVars = buildRequest(req({ body: { type: 'graphql', content: query } }))
    expect(JSON.parse(noVars.body!)).toEqual({ query })

    const badVars = buildRequest(
      req({ body: { type: 'graphql', content: query, variables: '{nope' } })
    )
    expect(JSON.parse(badVars.body!)).toEqual({ query })
  })

  it('interpolates {{vars}} in both the query and the variables', () => {
    const built = buildRequest(
      req({
        body: {
          type: 'graphql',
          content: 'query { user(id: "{{id}}") { name } }',
          variables: '{ "token": "{{token}}" }'
        }
      }),
      { id: '9', token: 'abc' }
    )
    expect(JSON.parse(built.body!)).toEqual({
      query: 'query { user(id: "9") { name } }',
      variables: { token: 'abc' }
    })
  })

  it('does not override an explicit content-type', () => {
    const built = buildRequest(
      req({
        headers: [{ name: 'Content-Type', value: 'application/graphql-response+json', enabled: true }],
        body: { type: 'graphql', content: query }
      })
    )
    expect(built.headers['Content-Type']).toBe('application/graphql-response+json')
  })
})

describe('.tiger format: graphql round-trip', () => {
  const sample = req({
    name: 'GQL',
    seq: 1,
    body: {
      type: 'graphql',
      content: 'query {\n  viewer { id }\n}',
      variables: '{\n  "limit": 10\n}'
    }
  })

  it('serializes the variables into a separate graphqlvars block', () => {
    const text = serializeRequest(sample)
    expect(text).toContain('body:graphql {')
    expect(text).toContain('graphqlvars {')
  })

  it('round-trips query and variables', () => {
    expect(parseRequest(serializeRequest(sample))).toEqual(sample)
  })

  it('is stable: serialize ∘ parse ∘ serialize is a fixed point', () => {
    const once = serializeRequest(sample)
    expect(serializeRequest(parseRequest(once))).toBe(once)
  })

  it('omits the graphqlvars block when there are no variables', () => {
    const noVars = req({ body: { type: 'graphql', content: 'query { ok }' } })
    const text = serializeRequest(noVars)
    expect(text).not.toContain('graphqlvars')
    expect(parseRequest(text).body).toEqual({ type: 'graphql', content: 'query { ok }' })
  })
})

describe('.tiger format: capture round-trip', () => {
  const sample = req({
    name: 'Login',
    captures: [
      { name: 'token', value: 'body.access_token', enabled: true },
      { name: 'rid', value: 'header.X-Request-Id', enabled: false }
    ]
  })

  it('serializes a capture block with disabled markers', () => {
    const text = serializeRequest(sample)
    expect(text).toContain('capture {')
    expect(text).toContain('  token: body.access_token')
    expect(text).toContain('  ~rid: header.X-Request-Id')
  })

  it('round-trips captures', () => {
    expect(parseRequest(serializeRequest(sample))).toEqual(sample)
  })

  it('omits the block when there are no captures', () => {
    expect(serializeRequest(req({}))).not.toContain('capture')
  })
})

describe('.tiger format: docs round-trip', () => {
  const sample = req({ name: 'Doc', docs: '# Login\n\nSend creds, get a token.\n- step one' })

  it('serializes a docs block', () => {
    expect(serializeRequest(sample)).toContain('docs {\n  # Login')
  })

  it('round-trips the markdown, dedented like a body', () => {
    expect(parseRequest(serializeRequest(sample))).toEqual(sample)
  })

  it('is stable across repeated serialize/parse cycles', () => {
    const once = serializeRequest(sample)
    expect(serializeRequest(parseRequest(once))).toBe(once)
  })

  it('omits the block when docs are empty', () => {
    expect(serializeRequest(req({ docs: '   ' }))).not.toContain('docs {')
  })
})

describe('minifyJsonText', () => {
  it('collapses valid json onto one line', () => {
    expect(minifyJsonText('{\n  "a": 1,\n  "b": [1, 2]\n}')).toEqual({
      ok: true,
      formatted: '{"a":1,"b":[1,2]}'
    })
  })

  it('reports invalid json without throwing', () => {
    expect(minifyJsonText('{nope').ok).toBe(false)
  })

  it('treats empty input as invalid', () => {
    expect(minifyJsonText('  ').ok).toBe(false)
  })
})

describe('importPostman graphql body', () => {
  const collection = {
    info: { name: 'GQL API' },
    item: [
      {
        name: 'Get viewer',
        request: {
          method: 'POST',
          url: 'https://api.test/graphql',
          body: {
            mode: 'graphql',
            graphql: {
              query: 'query { viewer { id } }',
              variables: '{ "limit": 5 }'
            }
          }
        }
      },
      {
        name: 'No vars',
        request: {
          method: 'POST',
          url: 'https://api.test/graphql',
          body: { mode: 'graphql', graphql: { query: 'query { ok }', variables: '' } }
        }
      }
    ]
  }

  it('maps mode graphql to a graphql body with variables', () => {
    const [first, second] = importPostman(collection).requests
    expect(first.request.body).toEqual({
      type: 'graphql',
      content: 'query { viewer { id } }',
      variables: '{ "limit": 5 }'
    })
    expect(second.request.body).toEqual({ type: 'graphql', content: 'query { ok }' })
  })
})
