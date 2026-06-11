/** Parse Set-Cookie response headers into displayable cookies. */

export interface ResponseCookie {
  name: string
  value: string
  attributes: string
}

export function parseSetCookie(headerValues: string[]): ResponseCookie[] {
  const cookies: ResponseCookie[] = []
  for (const raw of headerValues) {
    // A single header value may hold several cookies joined by commas; only
    // split where a new `name=` clearly starts (avoids splitting Expires=...).
    const parts = raw.split(/,(?=\s*[^;=\s]+=[^;]*)/)
    for (const part of parts) {
      const [pair, ...attrs] = part.split(';')
      const idx = pair.indexOf('=')
      if (idx <= 0) continue
      cookies.push({
        name: pair.slice(0, idx).trim(),
        value: pair.slice(idx + 1).trim(),
        attributes: attrs.map((a) => a.trim()).filter(Boolean).join('; ')
      })
    }
  }
  return cookies
}
