import { describe, expect, it } from 'vitest'
import { importInsomnia, importPostman, type ImportResult } from '../../src/core/import'
import { nearestFolderAuth } from '../../src/core/collectionSettings'
import { buildRequest } from '../../src/core/request'

const find = (result: ImportResult, name: string) => {
  const found = result.requests.find((r) => r.request.name === name)
  if (!found) throw new Error(`no request ${name}`)
  return found
}

/** What Send puts on the wire: the request's auth, else its nearest folder's (the App keys folders by path). */
const sent = (result: ImportResult, name: string, vars: Record<string, string>) => {
  const { path, request } = find(result, name)
  const byPath = new Map((result.folders ?? []).map((f) => [f.path.join('/'), f.auth]))
  const auth = request.auth ?? nearestFolderAuth(path, (p) => byPath.get(p.join('/'))) ?? result.auth
  return buildRequest({ ...request, auth }, vars).headers
}

const get = (name: string, url: string) => ({ name, request: { method: 'GET', url } })

describe('Postman: two sibling folders with the same name', () => {
  // Postman allows it; here each "Admin" folder has its own credentials.
  const shop = importPostman({
    info: { name: 'Shop', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    item: [
      {
        name: 'Admin',
        auth: { type: 'apikey', apikey: [{ key: 'key', value: 'X-Stats-Key' }, { key: 'value', value: '{{statsKey}}' }] },
        item: [get('Stats', 'https://shop.test/admin/stats')]
      },
      {
        name: 'Admin',
        auth: { type: 'basic', basic: [{ key: 'username', value: 'ops' }, { key: 'password', value: '{{opsPass}}' }] },
        item: [get('Purge cache', 'https://shop.test/admin/purge')]
      }
    ]
  })
  const vars = { statsKey: 'k-stats', opsPass: 'ops-pass' }

  it('keeps them apart: the second one is "Admin 2"', () => {
    expect(find(shop, 'Stats').path).toEqual(['Admin'])
    expect(find(shop, 'Purge cache').path).toEqual(['Admin 2'])
    expect(shop.folders?.map((f) => f.path)).toEqual([['Admin'], ['Admin 2']])
  })

  it('sends each folder its own credentials, never the other folder\'s', () => {
    expect(sent(shop, 'Stats', vars)).toEqual({ 'X-Stats-Key': 'k-stats' })
    expect(sent(shop, 'Purge cache', vars)).toEqual({ Authorization: `Basic ${btoa('ops:ops-pass')}` })
  })

  it('says which folder was renamed', () => {
    const note = shop.warnings?.find((w) => w.i18n?.key === 'imports.folderRenamed')
    expect(note).toMatchObject({ request: 'Admin 2', path: [], i18n: { vars: { name: 'Admin', renamed: 'Admin 2' } } })
  })

  it('never takes the name of a real sibling, and renames nested duplicates too', () => {
    const result = importPostman({
      info: { name: 'Nested' },
      item: [
        { name: 'Admin', item: [get('A', 'https://x.test/a')] },
        {
          name: 'Admin',
          item: [
            { name: 'Users', item: [get('B', 'https://x.test/b')] },
            { name: 'Users', item: [get('C', 'https://x.test/c')] }
          ]
        },
        { name: 'Admin 2', item: [get('D', 'https://x.test/d')] }
      ]
    })
    expect(result.requests.map((r) => [r.request.name, r.path.join('/')])).toEqual([
      ['A', 'Admin'],
      ['B', 'Admin 3/Users'],
      ['C', 'Admin 3/Users 2'],
      ['D', 'Admin 2']
    ])
  })
})

describe('Insomnia: two sibling folders with the same name', () => {
  const group = (id: string, name: string, parentId: string, extra: object = {}) => ({
    _id: id,
    _type: 'request_group',
    parentId,
    name,
    ...extra
  })
  const request = (id: string, name: string, parentId: string) => ({
    _id: id,
    _type: 'request',
    parentId,
    name,
    method: 'GET',
    url: `https://shop.test/${id}`
  })
  const shop = importInsomnia({
    _type: 'export',
    resources: [
      { _id: 'wrk', _type: 'workspace', name: 'Shop' },
      group('fld_1', 'Admin', 'wrk', {
        authentication: { type: 'apikey', key: 'X-Stats-Key', value: '{{ _.statsKey }}' }
      }),
      group('fld_2', 'Admin', 'wrk', { authentication: { type: 'basic', username: 'ops', password: '{{ _.opsPass }}' } }),
      request('stats', 'Stats', 'fld_1'),
      request('purge', 'Purge cache', 'fld_2')
    ]
  })

  it('keeps them apart and sends each folder its own credentials', () => {
    expect(find(shop, 'Stats').path).toEqual(['Admin'])
    expect(find(shop, 'Purge cache').path).toEqual(['Admin 2'])
    expect(sent(shop, 'Stats', { statsKey: 'k-stats' })).toEqual({ 'X-Stats-Key': 'k-stats' })
    expect(sent(shop, 'Purge cache', { opsPass: 'p' })).toEqual({ Authorization: `Basic ${btoa('ops:p')}` })
    expect(shop.warnings?.some((w) => w.i18n?.key === 'imports.folderRenamed' && w.request === 'Admin 2')).toBe(true)
  })

  it('keeps two workspaces with the same name apart in a multi-workspace export', () => {
    const result = importInsomnia({
      _type: 'export',
      resources: [
        { _id: 'w1', _type: 'workspace', name: 'API' },
        { _id: 'w2', _type: 'workspace', name: 'API' },
        request('one', 'One', 'w1'),
        request('two', 'Two', 'w2')
      ]
    })
    expect(find(result, 'One').path).toEqual(['API'])
    expect(find(result, 'Two').path).toEqual(['API 2'])
  })
})
