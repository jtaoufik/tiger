import { describe, expect, it } from 'vitest'
import { exportPostman } from '../../src/core/export'
import { importPostman } from '../../src/core/import'
import { buildRequest } from '../../src/core/request'

const first = (url: unknown) =>
  importPostman({ info: { name: 'Flags' }, item: [{ name: 'Items', request: { method: 'GET', url } }] }).requests[0].request

describe('Postman query params without a value', () => {
  it('sends ?flag as flag, not flag=, as Postman does', () => {
    const request = first({
      raw: 'https://x.test/items?flag&page=2',
      protocol: 'https',
      host: ['x', 'test'],
      path: ['items'],
      query: [
        { key: 'flag', value: null },
        { key: 'page', value: '2' }
      ]
    })
    expect(buildRequest(request).url).toBe('https://x.test/items?flag&page=2')
  })

  it('does the same for a URL given as a string', () => {
    expect(buildRequest(first('https://x.test/items?flag&page=2')).url).toBe('https://x.test/items?flag&page=2')
  })

  it('keeps an explicitly empty value, and a disabled flag stays a disabled row', () => {
    const request = first({
      raw: 'https://x.test/items?empty=&page=2',
      query: [
        { key: 'empty', value: '' },
        { key: 'off', value: null, disabled: true },
        { key: 'page', value: '2' }
      ]
    })
    expect(buildRequest(request).url).toBe('https://x.test/items?empty=&page=2')
    expect(request.query).toContainEqual({ name: 'off', value: '', enabled: false })
  })

  it('survives an export and a new import', () => {
    const exported = exportPostman('Flags', [
      { path: [], request: { ...first('https://x.test/items?flag&page=2'), name: 'Items' } }
    ])
    expect(buildRequest(importPostman(JSON.parse(JSON.stringify(exported))).requests[0].request).url).toBe(
      'https://x.test/items?flag&page=2'
    )
  })
})
