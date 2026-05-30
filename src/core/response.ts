/**
 * Format a raw HTTP response into the shape the UI renders: a status pill,
 * timing, a human size label, and a pretty-printed body when it is JSON.
 */

export interface RawResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  timeMs: number
}

export interface FormattedResponse {
  status: number
  statusText: string
  ok: boolean
  timeMs: number
  size: number
  sizeLabel: string
  contentType: string
  isJson: boolean
  body: string
  raw: string
  headers: Array<{ name: string; value: string }>
}

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
  if (res.body.trim().length > 0) {
    try {
      const parsed = JSON.parse(res.body)
      body = JSON.stringify(parsed, null, 2)
      isJson = true
    } catch {
      isJson = false
      body = res.body
    }
  }

  return {
    status: res.status,
    statusText: res.statusText,
    ok: res.status >= 200 && res.status < 300,
    timeMs: res.timeMs,
    size,
    sizeLabel: humanSize(size),
    contentType,
    isJson,
    body,
    raw: res.body,
    headers: Object.entries(res.headers).map(([name, value]) => ({ name, value }))
  }
}
