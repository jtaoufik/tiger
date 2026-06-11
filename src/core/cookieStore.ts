/**
 * Pure, environment-independent cookie logic. No Electron, no filesystem.
 * Imported by main/cookieJar.ts (which handles persistence) and testable in
 * isolation.
 */

import { parseSetCookie } from './cookies'

export interface StoredCookie {
  domain: string
  path: string
  name: string
  value: string
  /** Epoch ms; undefined = session cookie (kept until cleared). */
  expires?: number
}

/**
 * Upsert cookies parsed from Set-Cookie response headers into `jar`.
 *
 * Returns a new array (the original is mutated in place for efficiency, but a
 * reference to the same array is returned so callers can re-assign freely).
 * Expired cookies delete matching existing entries; non-expired cookies
 * replace or append. Uses `now` (epoch ms) so tests can control the clock.
 */
export function upsertCookies(
  jar: StoredCookie[],
  url: string,
  setCookieValues: string[],
  now: number
): StoredCookie[] {
  if (!setCookieValues.length) return jar

  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return jar
  }

  for (const raw of setCookieValues) {
    for (const cookie of parseSetCookie([raw])) {
      const attrs = Object.fromEntries(
        cookie.attributes
          .split(';')
          .map((a) => a.trim())
          .filter(Boolean)
          .map((a) => {
            const idx = a.indexOf('=')
            return idx === -1
              ? [a.toLowerCase(), 'true']
              : [a.slice(0, idx).trim().toLowerCase(), a.slice(idx + 1).trim()]
          })
      ) as Record<string, string>

      let expires: number | undefined
      if (attrs['max-age'] !== undefined) {
        expires = now + Number(attrs['max-age']) * 1000
      } else if (attrs.expires) {
        const t = Date.parse(attrs.expires)
        if (!Number.isNaN(t)) expires = t
      }

      const domain = (attrs.domain ?? host).replace(/^\./, '').toLowerCase()
      const path = attrs.path ?? '/'

      const existing = jar.findIndex(
        (c) => c.domain === domain && c.path === path && c.name === cookie.name
      )
      const next: StoredCookie = { domain, path, name: cookie.name, value: cookie.value, expires }

      if (expires !== undefined && expires <= now) {
        // expired = delete
        if (existing !== -1) jar.splice(existing, 1)
      } else if (existing !== -1) {
        jar[existing] = next
      } else {
        jar.push(next)
      }
    }
  }

  return jar
}

/**
 * Build the Cookie request header value for the given URL from `jar`.
 * Only cookies that are not expired and whose domain + path match are included.
 */
export function matchCookies(jar: StoredCookie[], url: string, now: number): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return ''
  }
  const host = parsed.hostname.toLowerCase()
  return jar
    .filter((c) => {
      if (c.expires !== undefined && c.expires <= now) return false
      if (host !== c.domain && !host.endsWith(`.${c.domain}`)) return false
      return parsed.pathname.startsWith(c.path)
    })
    .map((c) => `${c.name}=${c.value}`)
    .join('; ')
}
