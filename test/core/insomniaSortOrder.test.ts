import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { importInsomnia, type ImportResult } from '../../src/core/import'
import { collectionFiles } from '../../src/core/collectionFiles'

const listed = (result: ImportResult) => result.requests.map((r) => [...r.path, r.request.name].join('/'))

describe('Insomnia order', () => {
  // Insomnia lists a folder's children by metaSortKey (the user's drag order);
  // the export keeps resources in creation order.
  const v4 = {
    _type: 'export',
    __export_format: 4,
    resources: [
      { _id: 'wrk', _type: 'workspace', name: 'Orders' },
      { _id: 'req_c', _type: 'request', parentId: 'wrk', name: 'Delete order', method: 'DELETE', url: 'https://x.test/o/1', metaSortKey: -100 },
      { _id: 'req_a', _type: 'request', parentId: 'wrk', name: 'Create order', method: 'POST', url: 'https://x.test/o', metaSortKey: -300 },
      { _id: 'fld', _type: 'request_group', parentId: 'wrk', name: 'Admin', metaSortKey: -250 },
      { _id: 'req_z', _type: 'request', parentId: 'fld', name: 'Purge', method: 'POST', url: 'https://x.test/p', metaSortKey: 5 },
      { _id: 'req_y', _type: 'request', parentId: 'fld', name: 'Stats', method: 'GET', url: 'https://x.test/s', metaSortKey: 1 },
      { _id: 'req_b', _type: 'request', parentId: 'wrk', name: 'Get order', method: 'GET', url: 'https://x.test/o/1', metaSortKey: -200 }
    ]
  }

  it('keeps the order the user sorted the requests in (metaSortKey), not the export order', () => {
    expect(listed(importInsomnia(v4))).toEqual([
      'Create order',
      'Admin/Stats',
      'Admin/Purge',
      'Get order',
      'Delete order'
    ])
  })

  it('saves that order with the collection', () => {
    const result = importInsomnia(v4)
    const { files } = collectionFiles({ name: result.name, requests: result.requests })
    const seqOf = (file: string) => /seq: (\d+)/.exec(files.find((f) => f.path === file)!.content)?.[1]
    expect(['Create order.tiger', 'Get order.tiger', 'Delete order.tiger'].map(seqOf)).toEqual(['1', '2', '3'])
    expect(['Admin/Stats.tiger', 'Admin/Purge.tiger'].map(seqOf)).toEqual(['1', '2'])
  })

  it('reads meta.sortKey from an Insomnia 11 (v5) collection file', () => {
    const v5 = parse(`type: collection.insomnia.rest/5.0
name: Orders
collection:
  - name: Second
    url: https://x.test/2
    method: GET
    meta:
      id: req_2
      sortKey: -10
  - name: First
    url: https://x.test/1
    method: GET
    meta:
      id: req_1
      sortKey: -20
`)
    expect(listed(importInsomnia(v5))).toEqual(['First', 'Second'])
  })

  it('keeps the export order when there are no sort keys', () => {
    const plain = {
      _type: 'export',
      resources: [
        { _id: 'wrk', _type: 'workspace', name: 'W' },
        { _id: 'r2', _type: 'request', parentId: 'wrk', name: 'B', method: 'GET', url: 'https://x.test/b' },
        { _id: 'r1', _type: 'request', parentId: 'wrk', name: 'A', method: 'GET', url: 'https://x.test/a' }
      ]
    }
    expect(listed(importInsomnia(plain))).toEqual(['B', 'A'])
  })
})
