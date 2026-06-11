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
  /**
   * True when the Set-Cookie carried no (accepted) Domain attribute. Host-only
   * cookies are sent ONLY to the exact host that set them, never subdomains.
   */
  hostOnly?: boolean
  /** From the `Secure` attribute: only send over https: URLs. */
  secure?: boolean
}

/**
 * RFC 6265 §5.1.3 domain-match: `host` domain-matches `domain` when they are
 * identical or when `host` is a subdomain of `domain` (host ends with
 * `.<domain>` and the char before is a dot).
 */
function domainMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`)
}

/**
 * RFC 6265 §5.1.4 path-match: request path equals cookie path, or cookie path
 * is a prefix ending in '/', or it is a prefix and the next char of the request
 * path is '/'. This makes /api match /api/v2 but NOT /apiv2.
 */
function pathMatches(requestPath: string, cookiePath: string): boolean {
  if (requestPath === cookiePath) return true
  if (!requestPath.startsWith(cookiePath)) return false
  if (cookiePath.endsWith('/')) return true
  return requestPath[cookiePath.length] === '/'
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

      // Resolve the cookie's domain. A Set-Cookie may only widen its scope to a
      // domain that domain-matches the request host (and that has a dot, to
      // reject bare public-suffix-less labels like `com`). Anything else — an
      // evil.com trying to set Domain=victim.com — is rejected and we fall back
      // to a host-only cookie scoped to the request host.
      let domain = host
      let hostOnly = true
      const rawDomain = attrs.domain?.replace(/^\./, '').toLowerCase()
      if (rawDomain) {
        const acceptable =
          (rawDomain.includes('.') || rawDomain === host) && domainMatches(host, rawDomain)
        if (acceptable) {
          domain = rawDomain
          hostOnly = false
        }
        // else: rejected → keep host-only on the request host.
      }

      const path = attrs.path ?? '/'
      const secure = attrs.secure !== undefined

      const existing = jar.findIndex(
        (c) => c.domain === domain && c.path === path && c.name === cookie.name
      )
      const next: StoredCookie = {
        domain,
        path,
        name: cookie.name,
        value: cookie.value,
        expires,
        hostOnly,
        secure
      }

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
  const isSecure = parsed.protocol === 'https:'
  const requestPath = parsed.pathname || '/'
  return jar
    .filter((c) => {
      if (c.expires !== undefined && c.expires <= now) return false
      // Secure cookies are never sent over an insecure (http:) connection.
      if (c.secure && !isSecure) return false
      // Host-only cookies match the exact host only; domain cookies match the
      // host or any subdomain of it.
      if (c.hostOnly) {
        if (host !== c.domain) return false
      } else if (!domainMatches(host, c.domain)) {
        return false
      }
      return pathMatches(requestPath, c.path)
    })
    .map((c) => `${c.name}=${c.value}`)
    .join('; ')
}
