/**
 * Format a raw HTTP response into the shape the UI renders: a status pill,
 * timing, a human size label, and a pretty-printed body when it is JSON.
 */

/**
 * Phase timings in milliseconds, as far as the transport exposes them. `waiting`
 * is time to first byte (request sent until response headers), `download` is the
 * body transfer, `total` is the whole exchange. DNS/TCP/TLS are filled in only on
 * the Node send path (used when client certificates are configured).
 */
export interface ResponseTimings {
  total: number
  waiting: number
  download: number
  dns?: number
  tcp?: number
  tls?: number
}

export interface RawResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  timeMs: number
  timings?: ResponseTimings
}

export interface FormattedResponse {
  status: number
  statusText: string
  ok: boolean
  timeMs: number
  timings?: ResponseTimings
  size: number
  sizeLabel: string
  contentType: string
  isJson: boolean
  /** True when the body was too large to pretty-print (kept raw to avoid lag). */
  tooLargeToPretty: boolean
  body: string
  raw: string
  headers: Array<{ name: string; value: string }>
}

/** Above this body size we skip JSON pretty-printing and highlighting to stay responsive. */
export const PRETTY_LIMIT = 2_000_000

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value >= 100 || value % 1 === 0 ? 0 : 1)} ${units[unit]}`
}

function headerValue(headers: Record<string, string>, name: string): string {
  const lower = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v
  }
  return ''
}

export function formatResponse(res: RawResponse): FormattedResponse {
  const contentType = headerValue(res.headers, 'content-type')
  const size = byteLength(res.body)

  let isJson = false
  let body = res.body
  // Very large bodies are kept raw: parsing + re-stringifying a multi-MB string
  // is what makes other clients lag, so we skip it past PRETTY_LIMIT.
  const tooLargeToPretty = res.body.length > PRETTY_LIMIT
  if (res.body.trim().length > 0 && !tooLargeToPretty) {
    try {
      const parsed = JSON.parse(res.body)
      body = JSON.stringify(parsed, null, 2)
      isJson = true
    } catch {
      isJson = false
      body = res.body
    }
  } else if (tooLargeToPretty) {
    isJson = /json/i.test(contentType)
  }

  return {
    status: res.status,
    statusText: res.statusText,
    ok: res.status >= 200 && res.status < 300,
    timeMs: res.timeMs,
    timings: res.timings,
    size,
    sizeLabel: humanSize(size),
    contentType,
    isJson,
    tooLargeToPretty,
    body,
    raw: res.body,
    headers: Object.entries(res.headers).map(([name, value]) => ({ name, value }))
  }
}
