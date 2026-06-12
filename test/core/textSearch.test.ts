import { describe, expect, it } from 'vitest'
import { findMatches, splitByRanges } from '../../src/core/textSearch'

describe('findMatches', () => {
  it('finds all case-insensitive occurrences by default', () => {
    const r = findMatches('Tiger tiger TIGER', 'tiger')
    expect(r.ranges).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 11 },
      { start: 12, end: 17 }
    ])
    expect(r.truncated).toBe(false)
  })

  it('respects case sensitivity when asked', () => {
    const r = findMatches('Tiger tiger', 'tiger', { caseSensitive: true })
    expect(r.ranges).toEqual([{ start: 6, end: 11 }])
  })

  it('returns nothing for an empty query', () => {
    expect(findMatches('abc', '')).toEqual({ ranges: [], truncated: false })
  })

  it('does not match overlapping occurrences twice', () => {
    const r = findMatches('aaa', 'aa')
    expect(r.ranges).toEqual([{ start: 0, end: 2 }])
  })

  it('caps matches at the limit and flags truncation', () => {
    const r = findMatches('x'.repeat(10), 'x', { limit: 4 })
    expect(r.ranges).toHaveLength(4)
    expect(r.truncated).toBe(true)
  })

  it('treats the query literally, not as a regex', () => {
    const r = findMatches('a.c abc', 'a.c')
    expect(r.ranges).toEqual([{ start: 0, end: 3 }])
  })
})

describe('splitByRanges', () => {
  it('covers the whole text with ordered plain and match segments', () => {
    const text = 'one match two match three'
    const { ranges } = findMatches(text, 'match')
    const segs = splitByRanges(text, ranges)
    expect(segs.map((s) => s.text).join('')).toBe(text)
    expect(segs.filter((s) => s.match !== null)).toHaveLength(2)
    expect(segs[1]).toEqual({ text: 'match', match: 0 })
  })

  it('handles matches at the very start and end', () => {
    const segs = splitByRanges('abc', [
      { start: 0, end: 1 },
      { start: 2, end: 3 }
    ])
    expect(segs).toEqual([
      { text: 'a', match: 0 },
      { text: 'b', match: null },
      { text: 'c', match: 1 }
    ])
  })

  it('returns one plain segment when there are no matches', () => {
    expect(splitByRanges('abc', [])).toEqual([{ text: 'abc', match: null }])
  })
})
