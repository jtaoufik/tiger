import { describe, expect, it } from 'vitest'
import { parseEnvironment, serializeEnvironment } from '../../src/core/environment'
import { parseKeyValues, parseRequest, serializeRequest } from '../../src/core/tigerFormat'
import { buildRequest } from '../../src/core/request'
import { parseMultipartContent } from '../../src/core/multipart'
import type { TigerRequest } from '../../src/core/types'

describe('values the .tiger format used to lose', () => {
  const tricky = [
    'Pa$$w0rd}',
    'x{y',
    'He said "hi',
    '{\n  "id": 1,\n  "name": "Ada"\n}',
    '  padded  ',
    'line one\r\nline two'
  ]

  it('an environment keeps every value, and the variables after it, through save and reload', () => {
    const env = {
      name: 'dev',
      variables: [
        { name: 'baseUrl', value: 'https://api.test', enabled: true },
        ...tricky.map((value, i) => ({ name: `v${i}`, value, enabled: true })),
        { name: 'after', value: 'still-here', enabled: true }
      ]
    }
    const reloaded = parseEnvironment(serializeEnvironment(env))
    expect(reloaded).toEqual(env)
  })

  it('a request whose body or script has an unbalanced brace or quote still reloads', () => {
    const req: TigerRequest = {
      name: 'Broken on purpose',
      method: 'post',
      url: 'https://api.test/items',
      headers: [{ name: 'X-Note', value: 'a } b', enabled: true }],
      query: [],
      body: { type: 'json', content: '{"name": "half' },
      preScript: "const close = '}'\nconsole.log(\"{\")",
      postScript: 'tiger.test("quote \\" inside", () => {})'
    }
    const reloaded = parseRequest(serializeRequest(req))
    expect(reloaded.body.content).toBe(req.body.content)
    expect(reloaded.preScript).toBe(req.preScript)
    expect(reloaded.postScript).toBe(req.postScript)
    expect(reloaded.headers).toEqual(req.headers)
  })

  it('a form or multipart value with line breaks stays one field', () => {
    const value = 'first line\nsecond line'
    const req: TigerRequest = {
      name: 'Form',
      method: 'post',
      url: 'https://api.test/form',
      headers: [],
      query: [],
      body: { type: 'form', content: `note:: ${JSON.stringify(value)}\nother: 1` }
    }
    const built = buildRequest(parseRequest(serializeRequest(req)), {})
    expect(new URLSearchParams(built.body).get('note')).toBe(value)
    expect(new URLSearchParams(built.body).get('other')).toBe('1')
    expect(parseMultipartContent(`note:: ${JSON.stringify(value)}`)[0]).toMatchObject({ name: 'note', value })
  })

  it('still reads what older versions and people write by hand', () => {
    expect(parseKeyValues('  url: https://a.test/x\n  legacy::value\n')).toEqual([
      { name: 'url', value: 'https://a.test/x', enabled: true },
      { name: 'legacy', value: ':value', enabled: true }
    ])
    const handWritten = 'meta {\n  name: Hand\n}\npost {\n  url: https://a.test\n}\nbody:json {\n{\n  "a": { "b": 1 }\n}\n}\n'
    expect(parseRequest(handWritten).body.content).toBe('{\n  "a": { "b": 1 }\n}')
    expect(parseRequest('meta { name: One line }\nget { url: https://a.test }').url).toBe('https://a.test')
  })
})

describe('imported form values with line breaks', () => {
  it('stay one field from Postman (urlencoded and form-data) and Insomnia', async () => {
    const { importPostman } = await import('../../src/core/import/postman')
    const { importInsomnia } = await import('../../src/core/import/insomnia')
    const note = 'line one\nline two'
    const pm = importPostman({
      info: { name: 'P', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      item: [
        { name: 'Url', request: { method: 'POST', url: 'https://a.test/u', body: { mode: 'urlencoded', urlencoded: [{ key: 'note', value: note }, { key: 'n', value: '1' }] } } },
        { name: 'Multi', request: { method: 'POST', url: 'https://a.test/m', body: { mode: 'formdata', formdata: [{ key: 'note', value: note, type: 'text' }] } } }
      ]
    })
    const url = buildRequest(pm.requests[0].request, {})
    expect(new URLSearchParams(url.body).get('note')).toBe(note)
    expect(new URLSearchParams(url.body).get('n')).toBe('1')
    expect(buildRequest(pm.requests[1].request, {}).multipart).toEqual([{ name: 'note', value: note, isFile: false }])

    const ins = importInsomnia({
      _type: 'export',
      __export_format: 4,
      resources: [
        { _id: 'wrk', _type: 'workspace', name: 'W' },
        {
          _id: 'req',
          _type: 'request',
          parentId: 'wrk',
          name: 'Form',
          method: 'POST',
          url: 'https://a.test/f',
          body: { mimeType: 'application/x-www-form-urlencoded', params: [{ name: 'note', value: note }] }
        }
      ]
    })
    expect(new URLSearchParams(buildRequest(ins.requests[0].request, {}).body).get('note')).toBe(note)
  })
})
