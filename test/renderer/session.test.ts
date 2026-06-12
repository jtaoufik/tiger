import { describe, expect, it } from 'vitest'
import {
  parseStoredRoots,
  parseStoredTabs,
  resolveStoredTabs,
  tabKey,
  type OpenTab
} from '../../src/renderer/src/session'

describe('parseStoredRoots', () => {
  it('parses a valid list and filters junk', () => {
    expect(parseStoredRoots(JSON.stringify(['/a', '', 7, '/b']))).toEqual(['/a', '/b'])
  })
  it('returns empty for null, garbage and non-arrays', () => {
    expect(parseStoredRoots(null)).toEqual([])
    expect(parseStoredRoots('not json')).toEqual([])
    expect(parseStoredRoots('{"a":1}')).toEqual([])
  })
})

describe('parseStoredTabs', () => {
  it('round-trips all three tab kinds', () => {
    const tabs: OpenTab[] = [
      { kind: 'request', id: 'r1' },
      { kind: 'collection', colId: 'c1' },
      { kind: 'folder', colId: 'c1', path: ['a', 'b'] }
    ]
    expect(parseStoredTabs(JSON.stringify(tabs))).toEqual(tabs)
  })
  it('drops malformed entries but keeps valid ones', () => {
    const raw = JSON.stringify([
      { kind: 'request' },
      { kind: 'folder', colId: 'c', path: ['x', 5] },
      { kind: 'collection', colId: 'c' },
      'junk',
      null
    ])
    expect(parseStoredTabs(raw)).toEqual([{ kind: 'collection', colId: 'c' }])
  })
  it('returns empty on garbage', () => {
    expect(parseStoredTabs('zzz')).toEqual([])
    expect(parseStoredTabs(null)).toEqual([])
  })
})

describe('resolveStoredTabs', () => {
  const opened = [
    {
      colId: '/col',
      entryIds: new Set(['/col/col/a.tiger', '/col/col/posts/b.tiger']),
      folderKeys: new Set(['', 'posts'])
    }
  ]

  it('keeps tabs that resolve and drops deleted requests', () => {
    const tabs: OpenTab[] = [
      { kind: 'request', id: '/col/col/a.tiger' },
      { kind: 'request', id: '/col/col/deleted.tiger' },
      { kind: 'collection', colId: '/col' },
      { kind: 'collection', colId: '/gone' }
    ]
    expect(resolveStoredTabs(tabs, opened).map(tabKey)).toEqual([
      'r:/col/col/a.tiger',
      'c:/col'
    ])
  })

  it('keeps folder tabs whose folder still has entries, drops empty/gone folders', () => {
    const tabs: OpenTab[] = [
      { kind: 'folder', colId: '/col', path: ['posts'] },
      { kind: 'folder', colId: '/col', path: ['nope'] }
    ]
    const kept = resolveStoredTabs(tabs, opened)
    expect(kept).toEqual([{ kind: 'folder', colId: '/col', path: ['posts'] }])
  })
})
