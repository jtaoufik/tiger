import { describe, expect, it } from 'vitest'
import { extractCaptures } from '../../src/core/capture'
import type { KeyValue } from '../../src/core/types'

const response = {
  status: 201,
  headers: [
    { name: 'Content-Type', value: 'application/json' },
    { name: 'X-Request-Id', value: 'req-42' }
  ],
  body: JSON.stringify({
    access_token: 'tok-1',
    user: { id: 7, roles: ['admin', 'dev'], active: true },
    items: [{ sku: 'a-1' }, { sku: 'b-2' }],
    meta: null
  })
}

function row(name: string, value: string, enabled = true): KeyValue {
  return { name, value, enabled }
}

describe('extractCaptures', () => {
  it('captures the status code as a string', () => {
    expect(extractCaptures([row('code', 'status')], response)).toEqual([
      { name: 'code', value: '201' }
    ])
  })

  it('captures headers case-insensitively', () => {
    expect(extractCaptures([row('rid', 'header.x-request-id')], response)).toEqual([
      { name: 'rid', value: 'req-42' }
    ])
    expect(extractCaptures([row('ct', 'header.CONTENT-TYPE')], response)).toEqual([
      { name: 'ct', value: 'application/json' }
    ])
  })

  it('captures the raw body', () => {
    expect(extractCaptures([row('raw', 'body')], response)).toEqual([
      { name: 'raw', value: response.body }
    ])
  })

  it('resolves dot paths into the JSON body', () => {
    expect(extractCaptures([row('token', 'body.access_token')], response)).toEqual([
      { name: 'token', value: 'tok-1' }
    ])
  })

  it('resolves bracket indices and mixed paths', () => {
    expect(
      extractCaptures(
        [row('role', 'body.user.roles[1]'), row('sku', 'body.items[0].sku')],
        response
      )
    ).toEqual([
      { name: 'role', value: 'dev' },
      { name: 'sku', value: 'a-1' }
    ])
  })

  it('stringifies non-string JSON values', () => {
    expect(
      extractCaptures(
        [row('id', 'body.user.id'), row('active', 'body.user.active'), row('user', 'body.user')],
        response
      )
    ).toEqual([
      { name: 'id', value: '7' },
      { name: 'active', value: 'true' },
      { name: 'user', value: '{"id":7,"roles":["admin","dev"],"active":true}' }
    ])
  })

  it('skips disabled rows', () => {
    expect(extractCaptures([row('code', 'status', false)], response)).toEqual([])
  })

  it('skips unresolvable paths without breaking other rows', () => {
    const result = extractCaptures(
      [
        row('missing', 'body.nope.deep'),
        row('badHeader', 'header.X-Absent'),
        row('weird', 'cookie.session'),
        row('intoNull', 'body.meta.x'),
        row('ok', 'status')
      ],
      response
    )
    expect(result).toEqual([{ name: 'ok', value: '201' }])
  })

  it('skips body paths when the body is not JSON', () => {
    const html = { status: 200, headers: [], body: '<html></html>' }
    expect(extractCaptures([row('x', 'body.a'), row('raw', 'body')], html)).toEqual([
      { name: 'raw', value: '<html></html>' }
    ])
  })

  it('skips rows with an empty name or path', () => {
    expect(extractCaptures([row('', 'status'), row('x', '  ')], response)).toEqual([])
  })

  it('skips malformed bracket paths', () => {
    expect(extractCaptures([row('x', 'body.items[abc]')], response)).toEqual([])
    expect(extractCaptures([row('x', 'body..a')], response)).toEqual([])
  })
})
