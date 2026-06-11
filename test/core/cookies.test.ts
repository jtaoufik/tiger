import { describe, expect, it } from 'vitest'
import { parseSetCookie } from '../../src/core/cookies'

describe('parseSetCookie', () => {
  it('parses a single cookie with attributes', () => {
    expect(parseSetCookie(['sid=abc123; Path=/; HttpOnly'])).toEqual([
      { name: 'sid', value: 'abc123', attributes: 'Path=/; HttpOnly' }
    ])
  })

  it('splits comma-joined cookies without breaking Expires dates', () => {
    const cookies = parseSetCookie([
      'a=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/, b=2; Secure'
    ])
    expect(cookies.map((c) => c.name)).toEqual(['a', 'b'])
    expect(cookies[0].attributes).toContain('Expires=Wed')
  })

  it('returns empty for no headers', () => {
    expect(parseSetCookie([])).toEqual([])
  })
})
