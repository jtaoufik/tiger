import { describe, expect, it } from 'vitest'
import { fuzzyScore, searchItems, type SearchItem } from '../../src/core/search'

const items: SearchItem[] = [
  { id: '1', name: 'List posts', collection: 'Demo', method: 'get' },
  { id: '2', name: 'Create post', collection: 'Demo', method: 'post' },
  { id: '3', name: 'List users', collection: 'Demo', method: 'get' },
  { id: '4', name: 'Payment status', collection: 'Billing', method: 'get' },
  { id: '5', name: 'Create payment', collection: 'Billing', method: 'post' }
]

describe('fuzzyScore', () => {
  it('returns null when the query is not a subsequence', () => {
    expect(fuzzyScore('xyz', 'List posts')).toBeNull()
  })

  it('is case-insensitive', () => {
    expect(fuzzyScore('LIST', 'list posts')).not.toBeNull()
  })

  it('scores a word-start match above a scattered match', () => {
    const wordStart = fuzzyScore('po', 'List posts')!
    const scattered = fuzzyScore('po', 'Leopard socks')!
    expect(wordStart).toBeGreaterThan(scattered)
  })

  it('scores consecutive runs above spread-out matches', () => {
    expect(fuzzyScore('post', 'Create post')!).toBeGreaterThan(fuzzyScore('post', 'p o s t x')!)
  })
})

describe('searchItems', () => {
  it('returns everything (capped) for an empty query', () => {
    expect(searchItems(items, '', 3)).toHaveLength(3)
  })

  it('filters to matching items, best first', () => {
    const results = searchItems(items, 'create')
    expect(results.map((r) => r.name)).toEqual(['Create post', 'Create payment'])
  })

  it('matches against the collection name too', () => {
    const results = searchItems(items, 'billing')
    expect(results.map((r) => r.id).sort()).toEqual(['4', '5'])
  })

  it('respects the limit', () => {
    expect(searchItems(items, 'e', 2)).toHaveLength(2)
  })
})
