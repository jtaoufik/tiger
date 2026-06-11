/**
 * Supplementary tests for pure helpers that recent feature work left with thin
 * coverage. Targets: version edge cases, search no-match + whitespace, response
 * humanSize boundary, analytics appOpened + statusBucket boundary, diffView
 * additional meta prefixes.
 */

import { describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// version — additional edge cases
// ---------------------------------------------------------------------------

import { compareVersions, isNewerVersion } from '../../src/core/version'

describe('compareVersions – extra edge cases', () => {
  it('compares four-segment strings (truncates to three)', () => {
    // The regex only captures up to 3 segments; a 4th is ignored
    // v1.2.3.4 is not matched by the regex, so both sides return null → 0
    expect(compareVersions('1.2.3.4', '1.2.3')).toBe(0)
  })

  it('treats both-null as equal (returns 0)', () => {
    expect(compareVersions('bad', 'also-bad')).toBe(0)
  })

  it('returns 0 when one side is null (cannot determine order)', () => {
    expect(compareVersions('1.0.0', 'not-a-version')).toBe(0)
  })

  it('handles large minor/patch numbers correctly', () => {
    expect(compareVersions('1.100.0', '1.99.9')).toBe(1)
    expect(compareVersions('1.99.9', '1.100.0')).toBe(-1)
  })

  it('zero-padded numeric strings compare numerically', () => {
    // "01" parsed as Number("01") = 1, same as "1"
    expect(compareVersions('1.01.0', '1.1.0')).toBe(0)
  })
})

describe('isNewerVersion – extra edge cases', () => {
  it('returns false when both args are non-version strings', () => {
    expect(isNewerVersion('nope', 'also-nope')).toBe(false)
  })

  it('returns false when current is newer than latest', () => {
    expect(isNewerVersion('1.0.0', '2.0.0')).toBe(false)
  })

  it('handles v-prefix on both sides', () => {
    expect(isNewerVersion('v2.0.0', 'v1.9.9')).toBe(true)
    expect(isNewerVersion('v1.0.0', 'v1.0.0')).toBe(false)
  })

  it('handles a two-part latest version', () => {
    expect(isNewerVersion('2.1', '2.0.9')).toBe(true)
    expect(isNewerVersion('2.0', '2.0.1')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// search — additional edge cases
// ---------------------------------------------------------------------------

import { fuzzyScore, searchItems, type SearchItem } from '../../src/core/search'

describe('fuzzyScore – extra edge cases', () => {
  it('returns 0 for an empty query', () => {
    expect(fuzzyScore('', 'anything')).toBe(0)
  })

  it('handles a query longer than the target', () => {
    expect(fuzzyScore('abcdefghij', 'abc')).toBeNull()
  })

  it('scores a prefix match (whole query at start) above non-start', () => {
    const atStart = fuzzyScore('list', 'List posts')!
    const midString = fuzzyScore('list', 'Users list')!
    expect(atStart).toBeGreaterThan(midString)
  })

  it('returns a non-null score when query === target (case-insensitive)', () => {
    expect(fuzzyScore('get', 'Get')).not.toBeNull()
  })
})

describe('searchItems – extra edge cases', () => {
  const items: SearchItem[] = [
    { id: '1', name: 'List posts', collection: 'Demo', method: 'get' },
    { id: '2', name: 'Create post', collection: 'Demo', method: 'post' }
  ]

  it('returns an empty array for a query that matches nothing', () => {
    expect(searchItems(items, 'zzzzz')).toEqual([])
  })

  it('trims leading/trailing whitespace from the query', () => {
    // '  list  ' should match 'List posts' the same as 'list'
    expect(searchItems(items, '  list  ')).toHaveLength(1)
    expect(searchItems(items, '  list  ')[0].id).toBe('1')
  })

  it('uses the default limit of 8 when limit is not supplied', () => {
    const big: SearchItem[] = Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      name: `Request ${i}`,
      collection: 'Coll',
      method: 'get'
    }))
    expect(searchItems(big, 'request')).toHaveLength(8)
  })
})

// ---------------------------------------------------------------------------
// response — humanSize boundary values
// ---------------------------------------------------------------------------

import { humanSize } from '../../src/core/response'

describe('humanSize – boundary values', () => {
  it('formats 0 as "0 B"', () => {
    expect(humanSize(0)).toBe('0 B')
  })

  it('formats 1023 as bytes', () => {
    expect(humanSize(1023)).toBe('1023 B')
  })

  it('formats exactly 1 KB', () => {
    expect(humanSize(1024)).toBe('1 KB')
  })

  it('formats values in the MB range', () => {
    expect(humanSize(1024 * 1024)).toBe('1 MB')
    expect(humanSize(1.5 * 1024 * 1024)).toBe('1.5 MB')
  })

  it('formats values in the GB range', () => {
    expect(humanSize(1024 * 1024 * 1024)).toBe('1 GB')
    expect(humanSize(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB')
  })

  it('rounds whole-number KB without a decimal point', () => {
    expect(humanSize(3 * 1024)).toBe('3 KB')
  })
})

// ---------------------------------------------------------------------------
// analytics — untested event constructors + statusBucket boundary
// ---------------------------------------------------------------------------

import { events, statusBucket } from '../../src/core/analytics'

describe('events.appOpened', () => {
  it('returns the correct event name and no params', () => {
    const e = events.appOpened()
    expect(e.name).toBe('app_opened')
    expect(e.params).toBeUndefined()
  })
})

describe('statusBucket – boundary values', () => {
  it('buckets 1xx as "1xx"', () => {
    expect(statusBucket(101)).toBe('1xx')
  })

  it('buckets 3xx as "3xx"', () => {
    expect(statusBucket(301)).toBe('3xx')
  })

  it('treats 100 as the lower bound', () => {
    expect(statusBucket(100)).toBe('1xx')
  })

  it('treats 599 as the upper bound', () => {
    expect(statusBucket(599)).toBe('5xx')
  })

  it('returns unknown for 99', () => {
    expect(statusBucket(99)).toBe('unknown')
  })

  it('returns unknown for 600', () => {
    expect(statusBucket(600)).toBe('unknown')
  })
})

// ---------------------------------------------------------------------------
// diffView — all meta line prefixes (new file, deleted file, rename, similarity)
// ---------------------------------------------------------------------------

import { classifyDiffLine } from '../../src/core/diffView'

describe('classifyDiffLine – all meta prefixes', () => {
  const metaLines = [
    'new file mode 100644',
    'deleted file mode 100644',
    'rename from old/path.ts',
    'rename to new/path.ts',
    'similarity index 95%'
  ]

  it.each(metaLines)('classifies "%s" as meta', (line) => {
    expect(classifyDiffLine(line)).toBe('meta')
  })

  it('classifies a line starting with a space as ctx', () => {
    expect(classifyDiffLine(' unchanged line')).toBe('ctx')
  })

  it('classifies an empty line as ctx', () => {
    expect(classifyDiffLine('')).toBe('ctx')
  })
})
