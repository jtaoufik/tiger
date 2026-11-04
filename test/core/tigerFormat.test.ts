import { describe, expect, it } from 'vitest'
import {
  TigerParseError,
  dedent,
  parseKeyValues,
  parseRequest,
  serializeRequest,
  tokenizeBlocks
} from '../../src/core/tigerFormat'
import type { TigerRequest } from '../../src/core/types'

describe('tokenizeBlocks', () => {
  it('splits top-level blocks', () => {
    const blocks = tokenizeBlocks('meta {\n name: A\n}\nget {\n url: x\n}')
    expect(blocks.map((b) => b.name)).toEqual(['meta', 'get'])
  })

  it('captures a subtype', () => {
    const [block] = tokenizeBlocks('body:json {\n {"a":1}\n}')
    expect(block.name).toBe('body')
    expect(block.subtype).toBe('json')
  })

  it('keeps nested braces inside a block intact', () => {
    const [block] = tokenizeBlocks('body:json {\n { "nested": { "deep": true } }\n}')
    expect(block.content).toContain('{ "deep": true }')
  })

  it('throws on unbalanced braces', () => {
    expect(() => tokenizeBlocks('get {\n url: x')).toThrow(TigerParseError)
  })

  it('does not close a block on a } that sits inside a JSON string literal', () => {
    const [block] = tokenizeBlocks('body:json {\n {"a":"}"}\n}')
    expect(block.name).toBe('body')
    expect(block.content).toContain('{"a":"}"}')
  })

  it('honors backslash escapes inside string literals', () => {
    const [block] = tokenizeBlocks('body:json {\n {"a":"a\\"}b{"}\n}')
    expect(block.content).toContain('{"a":"a\\"}b{"}')
  })

  it('keeps a multi-segment subtype (body:graphql:vars) intact', () => {
    const [block] = tokenizeBlocks('body:graphql:vars {\n {"id":1}\n}')
    expect(block.name).toBe('body')
    expect(block.subtype).toBe('graphql:vars')
  })
})

describe('parseKeyValues', () => {
  it('splits on the first colon only', () => {
    const [kv] = parseKeyValues('Authorization: Bearer a:b:c')
    expect(kv).toEqual({ name: 'Authorization', value: 'Bearer a:b:c', enabled: true })
  })

  it('marks ~lines as disabled', () => {
    const [kv] = parseKeyValues('~X-Debug: 1')
    expect(kv).toEqual({ name: 'X-Debug', value: '1', enabled: false })
  })

  it('ignores blank and comment lines', () => {
    expect(parseKeyValues('\n# a comment\n// also\nAccept: */*')).toHaveLength(1)
  })

  it('throws when a colon is missing', () => {
    expect(() => parseKeyValues('no colon here')).toThrow(TigerParseError)
  })
})

describe('dedent', () => {
  it('strips the common indentation and outer blank lines', () => {
    expect(dedent('\n    a\n      b\n')).toBe('a\n  b')
  })
})

describe('parseRequest', () => {
  it('parses a full request', () => {
    const text = `
meta {
  name: Get user
  seq: 2
}
get {
  url: {{baseUrl}}/users/{{id}}
}
query {
  expand: profile
}
headers {
  Accept: application/json
  ~X-Debug: 1
}
body:json {
  { "note": "hi" }
}
`
    const req = parseRequest(text)
    expect(req.name).toBe('Get user')
    expect(req.seq).toBe(2)
    expect(req.method).toBe('get')
    expect(req.url).toBe('{{baseUrl}}/users/{{id}}')
    expect(req.query).toEqual([{ name: 'expand', value: 'profile', enabled: true }])
    expect(req.headers).toEqual([
      { name: 'Accept', value: 'application/json', enabled: true },
      { name: 'X-Debug', value: '1', enabled: false }
    ])
    expect(req.body).toEqual({ type: 'json', content: '{ "note": "hi" }' })
  })

  it('throws when no method block is present', () => {
    expect(() => parseRequest('meta {\n name: x\n}')).toThrow(/missing a method/)
  })

  it('defaults seq to undefined and body to none', () => {
    const req = parseRequest('meta {\n name: x\n}\nget {\n url: y\n}')
    expect(req.seq).toBeUndefined()
    expect(req.body.type).toBe('none')
  })
})

describe('serializeRequest', () => {
  const sample: TigerRequest = {
    name: 'Create',
    seq: 1,
    method: 'post',
    url: 'https://api.test/users',
    query: [{ name: 'dry', value: 'true', enabled: true }],
    headers: [{ name: 'Accept', value: 'application/json', enabled: true }],
    body: { type: 'json', content: '{\n  "name": "Ada"\n}' }
  }

  it('round-trips through parse', () => {
    expect(parseRequest(serializeRequest(sample))).toEqual(sample)
  })

  it('is stable: serialize ∘ parse ∘ serialize is a fixed point', () => {
    const once = serializeRequest(sample)
    expect(serializeRequest(parseRequest(once))).toBe(once)
  })

  it('omits empty header, query and body blocks', () => {
    const out = serializeRequest({
      name: 'Ping',
      method: 'get',
      url: 'x',
      query: [],
      headers: [],
      body: { type: 'none', content: '' }
    })
    expect(out).not.toContain('headers')
    expect(out).not.toContain('query')
    expect(out).not.toContain('body')
  })

  it('preserves disabled markers', () => {
    const out = serializeRequest({
      ...sample,
      headers: [{ name: 'X-Off', value: '1', enabled: false }]
    })
    expect(out).toContain('~X-Off: 1')
  })

  it('round-trips a json body whose string values contain braces', () => {
    const withBraces: TigerRequest = {
      ...sample,
      body: { type: 'json', content: '{ "a": "}", "b": "{x}", "c": "a\\"}b" }' }
    }
    const serialized = serializeRequest(withBraces)
    // The serialize→parse cycle must not throw and must preserve the body.
    const reparsed = parseRequest(serialized)
    expect(reparsed.body).toEqual(withBraces.body)
    expect(reparsed).toEqual(withBraces)
  })
})

describe('pre/post request scripts', () => {
  it('round-trips script:pre and script:post blocks', () => {
    const req = {
      name: 'Login',
      method: 'post' as const,
      url: 'https://api.test/login',
      query: [],
      headers: [],
      body: { type: 'none' as const, content: '' },
      preScript: 'tiger.setVar("nonce", "x")',
      postScript: 'tiger.test("ok", () => tiger.expect(tiger.response.status === 200))'
    }
    const out = serializeRequest(req)
    expect(out).toContain('script:pre {')
    expect(out).toContain('script:post {')
    const back = parseRequest(out)
    expect(back.preScript).toBe(req.preScript)
    expect(back.postScript).toBe(req.postScript)
  })
})

describe('fields the plain line cannot hold', () => {
  const base: TigerRequest = {
    name: 'n',
    method: 'post',
    url: 'https://api.test/x',
    query: [],
    headers: [],
    body: { type: 'none', content: '' }
  }
  const again = (r: TigerRequest) => parseRequest(serializeRequest(r))
  const tricky = ['  padded  ', 'line one\nline two', 'Pa$$w0rd}', 'He said "hi']

  it('keeps a padded or multiline name and url', () => {
    for (const value of tricky) {
      expect(again({ ...base, name: value }).name).toBe(value)
      expect(again({ ...base, url: value }).url).toBe(value)
    }
  })

  it('keeps a padded or multiline value in every auth field', () => {
    for (const v of tricky) {
      expect(again({ ...base, auth: { type: 'bearer', token: v } }).auth).toEqual({ type: 'bearer', token: v })
      expect(again({ ...base, auth: { type: 'basic', username: v, password: v } }).auth).toEqual({
        type: 'basic',
        username: v,
        password: v
      })
      expect(again({ ...base, auth: { type: 'apikey', key: v, value: v, in: 'query' } }).auth).toEqual({
        type: 'apikey',
        key: v,
        value: v,
        in: 'query'
      })
      const oauth = {
        type: 'oauth2' as const,
        grantType: 'client_credentials' as const,
        tokenUrl: v,
        clientId: v,
        clientSecret: v,
        scope: v
      }
      expect(again({ ...base, auth: oauth }).auth).toEqual(oauth)
    }
  })

  it('writes the plain line when nothing needs quoting, so unrelated files do not change', () => {
    const out = serializeRequest({
      ...base,
      name: 'Get user',
      url: 'https://api.test/x',
      auth: { type: 'basic', username: 'ada', password: 'pw' }
    })
    expect(out).toContain('  name: Get user\n')
    expect(out).toContain('  url: https://api.test/x\n')
    expect(out).toContain('  username: ada\n  password: pw\n')
    expect(out).not.toContain('::')
  })

  it('keeps a header or query name holding a colon or starting like a comment or marker', () => {
    const names = ['a:b', '#x', '//y', '~z', '"q', ' padded ']
    const headers = names.map((name) => ({ name, value: 'v', enabled: true }))
    const disabled = names.map((name) => ({ name, value: 'v', enabled: false }))
    expect(again({ ...base, headers, query: disabled })).toMatchObject({ headers, query: disabled })
    expect(parseKeyValues('"a:b": v\n~"#x":: " padded value "')).toEqual([
      { name: 'a:b', value: 'v', enabled: true },
      { name: '#x', value: ' padded value ', enabled: false }
    ])
    // Plain names stay plain, so existing files keep their lines.
    expect(parseKeyValues('Accept: text/plain')).toEqual([{ name: 'Accept', value: 'text/plain', enabled: true }])
  })

  it('still reads a hand-written name that starts with a quote', () => {
    expect(parseKeyValues('"unterminated: v')).toEqual([{ name: '"unterminated', value: 'v', enabled: true }])
    expect(parseKeyValues('"If-None-Match": "etag"')).toEqual([{ name: 'If-None-Match', value: '"etag"', enabled: true }])
  })

  it('keeps the body type of an empty body (body:json {})', () => {
    for (const type of ['json', 'xml', 'text', 'form', 'graphql', 'multipart'] as const) {
      const out = serializeRequest({ ...base, body: { type, content: '' } })
      expect(out).toContain(`body:${type} {\n}`)
      expect(parseRequest(out).body).toEqual({ type, content: '' })
    }
    expect(again({ ...base, body: { type: 'graphql', content: '', variables: '{"a":1}' } }).body).toEqual({
      type: 'graphql',
      content: '',
      variables: '{"a":1}'
    })
  })

  it('leaves a non-numeric seq out instead of writing NaN', () => {
    expect(parseRequest('meta {\n  seq: abc\n}\nget {\n  url: x\n}').seq).toBeUndefined()
    expect(serializeRequest({ ...base, seq: Number('abc') })).not.toContain('seq')
  })

  it('reads an unknown body subtype as text', () => {
    expect(parseRequest('get {\n  url: x\n}\nbody:sparql {\n  SELECT *\n}').body).toEqual({ type: 'text', content: 'SELECT *' })
  })

  it('parses a form line without a colon leniently when asked', () => {
    expect(() => parseKeyValues('flag')).toThrow(TigerParseError)
    expect(parseKeyValues('flag\n~off\na: 1', true)).toEqual([
      { name: 'flag', value: '', enabled: true },
      { name: 'off', value: '', enabled: false },
      { name: 'a', value: '1', enabled: true }
    ])
  })
})
