import { describe, expect, it } from 'vitest'
import { matchCookies, upsertCookies } from '../../src/core/cookieStore'
import type { StoredCookie } from '../../src/core/cookieStore'

const NOW = 1_700_000_000_000 // fixed epoch ms for deterministic tests

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jar(...cookies: StoredCookie[]): StoredCookie[] {
  return [...cookies]
}

function cookie(overrides: Partial<StoredCookie> & Pick<StoredCookie, 'name' | 'value'>): StoredCookie {
  return { domain: 'example.com', path: '/', ...overrides }
}

// ---------------------------------------------------------------------------
// upsertCookies
// ---------------------------------------------------------------------------

describe('upsertCookies – basic parsing', () => {
  it('inserts a simple session cookie', () => {
    const result = upsertCookies([], 'https://example.com/', ['sid=abc123'], NOW)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ name: 'sid', value: 'abc123', domain: 'example.com', path: '/' })
    expect(result[0].expires).toBeUndefined()
  })

  it('parses a path attribute', () => {
    const result = upsertCookies([], 'https://example.com/', ['tok=x; Path=/api'], NOW)
    expect(result[0].path).toBe('/api')
  })

  it('returns the jar unchanged for an empty set-cookie list', () => {
    const original: StoredCookie[] = []
    const result = upsertCookies(original, 'https://example.com/', [], NOW)
    expect(result).toBe(original)
  })

  it('ignores a malformed URL', () => {
    const result = upsertCookies([], 'not-a-url', ['sid=abc'], NOW)
    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Domain handling
// ---------------------------------------------------------------------------

describe('upsertCookies – domain attribute', () => {
  it('uses the request host when no Domain attribute is present', () => {
    const result = upsertCookies([], 'https://api.example.com/v1', ['tok=1'], NOW)
    expect(result[0].domain).toBe('api.example.com')
  })

  it('strips a leading dot from the Domain attribute', () => {
    const result = upsertCookies([], 'https://api.example.com/', ['tok=1; Domain=.example.com'], NOW)
    expect(result[0].domain).toBe('example.com')
  })

  it('lowercases the domain', () => {
    const result = upsertCookies([], 'https://Example.COM/', ['tok=1; Domain=Example.COM'], NOW)
    expect(result[0].domain).toBe('example.com')
  })
})

// ---------------------------------------------------------------------------
// Expiry – max-age
// ---------------------------------------------------------------------------

describe('upsertCookies – max-age', () => {
  it('sets expires = now + max-age * 1000', () => {
    const result = upsertCookies([], 'https://example.com/', ['tok=1; Max-Age=60'], NOW)
    expect(result[0].expires).toBe(NOW + 60_000)
  })

  it('does NOT insert a cookie with max-age=0 (expired immediately)', () => {
    const result = upsertCookies([], 'https://example.com/', ['tok=1; Max-Age=0'], NOW)
    expect(result).toHaveLength(0)
  })

  it('deletes an existing cookie when max-age=0 is received', () => {
    const existing = jar(cookie({ name: 'tok', value: 'old' }))
    const result = upsertCookies(existing, 'https://example.com/', ['tok=old; Max-Age=0'], NOW)
    expect(result).toHaveLength(0)
  })

  it('does NOT insert a cookie with a negative max-age', () => {
    const result = upsertCookies([], 'https://example.com/', ['tok=1; Max-Age=-1'], NOW)
    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Expiry – Expires attribute
// ---------------------------------------------------------------------------

describe('upsertCookies – Expires attribute', () => {
  it('parses a future Expires date', () => {
    const future = new Date(NOW + 3_600_000).toUTCString()
    const result = upsertCookies([], 'https://example.com/', [`tok=1; Expires=${future}`], NOW)
    expect(result[0].expires).toBe(NOW + 3_600_000)
  })

  it('does NOT insert a cookie whose Expires is in the past', () => {
    const past = new Date(NOW - 1000).toUTCString()
    const result = upsertCookies([], 'https://example.com/', [`tok=1; Expires=${past}`], NOW)
    expect(result).toHaveLength(0)
  })

  it('deletes an existing cookie when a past Expires is received', () => {
    const existing = jar(cookie({ name: 'tok', value: 'old' }))
    const past = new Date(NOW - 1000).toUTCString()
    const result = upsertCookies(existing, 'https://example.com/', [`tok=new; Expires=${past}`], NOW)
    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Overwrite (same name / domain / path)
// ---------------------------------------------------------------------------

describe('upsertCookies – overwrite semantics', () => {
  it('replaces a cookie with the same name, domain, and path', () => {
    const existing = jar(cookie({ name: 'sid', value: 'old' }))
    const result = upsertCookies(existing, 'https://example.com/', ['sid=new'], NOW)
    expect(result).toHaveLength(1)
    expect(result[0].value).toBe('new')
  })

  it('keeps cookies that differ only in path', () => {
    const existing = jar(
      cookie({ name: 'tok', value: 'root', path: '/' }),
      cookie({ name: 'tok', value: 'api', path: '/api' })
    )
    const result = upsertCookies(existing, 'https://example.com/', ['tok=api2; Path=/api'], NOW)
    expect(result).toHaveLength(2)
    const apiCookie = result.find((c) => c.path === '/api')
    expect(apiCookie?.value).toBe('api2')
    const rootCookie = result.find((c) => c.path === '/')
    expect(rootCookie?.value).toBe('root')
  })

  it('keeps cookies that differ only in domain', () => {
    const existing: StoredCookie[] = [
      { name: 'tok', value: 'sub', domain: 'sub.example.com', path: '/' },
      { name: 'tok', value: 'apex', domain: 'example.com', path: '/' }
    ]
    const result = upsertCookies(existing, 'https://sub.example.com/', ['tok=sub2'], NOW)
    expect(result).toHaveLength(2)
    const subCookie = result.find((c) => c.domain === 'sub.example.com')
    expect(subCookie?.value).toBe('sub2')
  })

  it('appends rather than overwrites when the name matches but path differs', () => {
    const existing = jar(cookie({ name: 'tok', value: 'old', path: '/' }))
    const result = upsertCookies(existing, 'https://example.com/', ['tok=new; Path=/v2'], NOW)
    expect(result).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Session cookies
// ---------------------------------------------------------------------------

describe('upsertCookies – session cookies', () => {
  it('keeps session cookies indefinitely (no expires)', () => {
    const result = upsertCookies([], 'https://example.com/', ['session=abc'], NOW)
    expect(result[0].expires).toBeUndefined()
  })

  it('session cookies survive matchCookies even at a very large now', () => {
    const jar = upsertCookies([], 'https://example.com/', ['session=alive'], NOW)
    const header = matchCookies(jar, 'https://example.com/', NOW + 1e12)
    expect(header).toBe('session=alive')
  })
})

// ---------------------------------------------------------------------------
// matchCookies – domain suffix matching
// ---------------------------------------------------------------------------

describe('matchCookies – domain suffix', () => {
  it('sends cookie to the exact domain', () => {
    const j = jar(cookie({ name: 'tok', value: '1', domain: 'example.com' }))
    expect(matchCookies(j, 'https://example.com/path', NOW)).toBe('tok=1')
  })

  it('sends cookie to a subdomain (api.acme.com matches acme.com)', () => {
    const j: StoredCookie[] = [{ name: 'tok', value: '1', domain: 'acme.com', path: '/' }]
    expect(matchCookies(j, 'https://api.acme.com/resource', NOW)).toBe('tok=1')
  })

  it('deep subdomains match too', () => {
    const j: StoredCookie[] = [{ name: 'tok', value: '1', domain: 'acme.com', path: '/' }]
    expect(matchCookies(j, 'https://v2.api.acme.com/resource', NOW)).toBe('tok=1')
  })

  it('does NOT send cookie to a domain that only ends with the same string (evilacme.com)', () => {
    const j: StoredCookie[] = [{ name: 'tok', value: '1', domain: 'acme.com', path: '/' }]
    expect(matchCookies(j, 'https://evilacme.com/resource', NOW)).toBe('')
  })

  it('does NOT send to a completely different domain', () => {
    const j = jar(cookie({ name: 'tok', value: '1', domain: 'example.com' }))
    expect(matchCookies(j, 'https://other.com/', NOW)).toBe('')
  })

  it('is case-insensitive for the host', () => {
    const j: StoredCookie[] = [{ name: 'tok', value: '1', domain: 'example.com', path: '/' }]
    expect(matchCookies(j, 'https://Example.COM/', NOW)).toBe('tok=1')
  })
})

// ---------------------------------------------------------------------------
// matchCookies – path prefix matching
// ---------------------------------------------------------------------------

describe('matchCookies – path prefix', () => {
  it('sends a root-path cookie to any path', () => {
    const j = jar(cookie({ name: 'tok', value: '1', path: '/' }))
    expect(matchCookies(j, 'https://example.com/api/v2/things', NOW)).toBe('tok=1')
  })

  it('sends a /api cookie to /api/v2', () => {
    const j = jar(cookie({ name: 'tok', value: '1', path: '/api' }))
    expect(matchCookies(j, 'https://example.com/api/v2', NOW)).toBe('tok=1')
  })

  it('does NOT send a /api cookie to /apiv2 (RFC 6265 path-match, not raw prefix)', () => {
    const j = jar(cookie({ name: 'tok', value: '1', path: '/api' }))
    // /apiv2 raw-starts-with /api, but RFC 6265 §5.1.4 requires the next char to
    // be a '/' (or the cookie path to end in '/'). /apiv2 fails both.
    expect(matchCookies(j, 'https://example.com/apiv2', NOW)).toBe('')
  })

  it('sends a /api cookie to exactly /api', () => {
    const j = jar(cookie({ name: 'tok', value: '1', path: '/api' }))
    expect(matchCookies(j, 'https://example.com/api', NOW)).toBe('tok=1')
  })

  it('sends a /api/ cookie to /api/anything (cookie path ends in /)', () => {
    const j = jar(cookie({ name: 'tok', value: '1', path: '/api/' }))
    expect(matchCookies(j, 'https://example.com/api/v2', NOW)).toBe('tok=1')
  })

  it('does NOT send a /admin cookie to /path', () => {
    const j = jar(cookie({ name: 'tok', value: '1', path: '/admin' }))
    expect(matchCookies(j, 'https://example.com/path', NOW)).toBe('')
  })
})

// ---------------------------------------------------------------------------
// matchCookies – expiry filtering
// ---------------------------------------------------------------------------

describe('matchCookies – expiry', () => {
  it('excludes cookies whose expires is in the past', () => {
    const j = jar(cookie({ name: 'tok', value: '1', expires: NOW - 1 }))
    expect(matchCookies(j, 'https://example.com/', NOW)).toBe('')
  })

  it('includes cookies whose expires is in the future', () => {
    const j = jar(cookie({ name: 'tok', value: '1', expires: NOW + 60_000 }))
    expect(matchCookies(j, 'https://example.com/', NOW)).toBe('tok=1')
  })

  it('excludes a cookie expiring exactly at now (boundary: <= now is expired)', () => {
    const j = jar(cookie({ name: 'tok', value: '1', expires: NOW }))
    expect(matchCookies(j, 'https://example.com/', NOW)).toBe('')
  })
})

// ---------------------------------------------------------------------------
// matchCookies – multiple cookies
// ---------------------------------------------------------------------------

describe('matchCookies – multiple cookies', () => {
  it('joins multiple matching cookies with "; "', () => {
    const j: StoredCookie[] = [
      { name: 'a', value: '1', domain: 'example.com', path: '/' },
      { name: 'b', value: '2', domain: 'example.com', path: '/' }
    ]
    expect(matchCookies(j, 'https://example.com/', NOW)).toBe('a=1; b=2')
  })

  it('only includes cookies matching the URL', () => {
    const j: StoredCookie[] = [
      { name: 'a', value: '1', domain: 'example.com', path: '/' },
      { name: 'b', value: '2', domain: 'other.com', path: '/' }
    ]
    expect(matchCookies(j, 'https://example.com/', NOW)).toBe('a=1')
  })

  it('returns empty string when no cookies match', () => {
    const j = jar(cookie({ name: 'tok', value: '1', domain: 'other.com' }))
    expect(matchCookies(j, 'https://example.com/', NOW)).toBe('')
  })
})

// ---------------------------------------------------------------------------
// matchCookies – invalid URL
// ---------------------------------------------------------------------------

describe('matchCookies – invalid URL', () => {
  it('returns empty string for a malformed URL', () => {
    const j = jar(cookie({ name: 'tok', value: '1' }))
    expect(matchCookies(j, 'not-a-url', NOW)).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Round-trip: upsert then match
// ---------------------------------------------------------------------------

describe('round-trip: upsert then match', () => {
  it('stores a cookie and retrieves it for the same URL', () => {
    const j = upsertCookies([], 'https://api.example.com/v1', ['auth=token123'], NOW)
    expect(matchCookies(j, 'https://api.example.com/v1/users', NOW)).toBe('auth=token123')
  })

  it('a parent-domain cookie is served to the subdomain that set it', () => {
    // Set-Cookie with Domain=example.com from api.example.com
    const j = upsertCookies(
      [],
      'https://api.example.com/',
      ['global=1; Domain=example.com'],
      NOW
    )
    expect(matchCookies(j, 'https://api.example.com/', NOW)).toBe('global=1')
    expect(matchCookies(j, 'https://other.example.com/', NOW)).toBe('global=1')
    expect(matchCookies(j, 'https://evilexample.com/', NOW)).toBe('')
  })

  it('overwriting updates the value in place', () => {
    let j = upsertCookies([], 'https://example.com/', ['tok=v1'], NOW)
    j = upsertCookies(j, 'https://example.com/', ['tok=v2'], NOW + 1)
    expect(matchCookies(j, 'https://example.com/', NOW + 2)).toBe('tok=v2')
    expect(j).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Cross-domain injection + scoping security
// ---------------------------------------------------------------------------

describe('upsertCookies – cross-domain Domain rejection', () => {
  it('evil.com setting Domain=victim.com is NOT stored for victim (falls back to host-only)', () => {
    const j = upsertCookies([], 'https://evil.com/', ['tok=pwn; Domain=victim.com'], NOW)
    // The rejected Domain falls back to a host-only cookie on evil.com.
    expect(j).toHaveLength(1)
    expect(j[0].domain).toBe('evil.com')
    expect(j[0].hostOnly).toBe(true)
    // It is therefore never sent to the victim.
    expect(matchCookies(j, 'https://victim.com/', NOW)).toBe('')
    expect(matchCookies(j, 'https://www.victim.com/', NOW)).toBe('')
  })

  it('rejects a bare public-suffix-less single-label Domain like "com"', () => {
    const j = upsertCookies([], 'https://api.example.com/', ['tok=1; Domain=com'], NOW)
    expect(j[0].hostOnly).toBe(true)
    expect(j[0].domain).toBe('api.example.com')
    // Must not leak to an unrelated .com host.
    expect(matchCookies(j, 'https://evil.com/', NOW)).toBe('')
  })

  it('accepts a parent Domain that the host domain-matches', () => {
    const j = upsertCookies([], 'https://api.example.com/', ['tok=1; Domain=example.com'], NOW)
    expect(j[0].domain).toBe('example.com')
    expect(j[0].hostOnly).toBe(false)
  })

  it('marks a cookie with no Domain attribute as host-only', () => {
    const j = upsertCookies([], 'https://api.example.com/', ['tok=1'], NOW)
    expect(j[0].hostOnly).toBe(true)
    expect(j[0].domain).toBe('api.example.com')
  })
})

describe('matchCookies – host-only scoping', () => {
  it('a host-only cookie is NOT sent to a subdomain', () => {
    const j = upsertCookies([], 'https://example.com/', ['tok=1'], NOW)
    expect(matchCookies(j, 'https://example.com/', NOW)).toBe('tok=1')
    expect(matchCookies(j, 'https://api.example.com/', NOW)).toBe('')
  })

  it('a domain cookie IS sent to a subdomain', () => {
    const j = upsertCookies([], 'https://example.com/', ['tok=1; Domain=example.com'], NOW)
    expect(matchCookies(j, 'https://api.example.com/', NOW)).toBe('tok=1')
  })
})

describe('cookies – Secure attribute', () => {
  it('records the secure flag from the Secure attribute', () => {
    const j = upsertCookies([], 'https://example.com/', ['tok=1; Secure'], NOW)
    expect(j[0].secure).toBe(true)
  })

  it('a secure cookie is NOT sent over an http: URL', () => {
    const j = upsertCookies([], 'https://example.com/', ['tok=1; Secure'], NOW)
    expect(matchCookies(j, 'http://example.com/', NOW)).toBe('')
    expect(matchCookies(j, 'https://example.com/', NOW)).toBe('tok=1')
  })

  it('a non-secure cookie is sent over both http: and https:', () => {
    const j = upsertCookies([], 'https://example.com/', ['tok=1'], NOW)
    expect(matchCookies(j, 'http://example.com/', NOW)).toBe('tok=1')
    expect(matchCookies(j, 'https://example.com/', NOW)).toBe('tok=1')
  })
})
