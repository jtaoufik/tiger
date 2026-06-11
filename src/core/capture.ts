/**
 * Response captures for request chaining. Each capture row maps a variable
 * name to a path into the response:
 *
 *   status            → the numeric status code
 *   header.<Name>     → a response header (name matched case-insensitively)
 *   body              → the raw response body text
 *   body.a.b[0].c     → a JSON dot/bracket path into the parsed body
 *
 * Disabled rows and paths that do not resolve are skipped silently — a failed
 * capture must never break the request that produced the response.
 */

import type { KeyValue } from './types'

export interface CaptureResponse {
  status: number
  headers: Array<{ name: string; value: string }>
  body: string
}

/**
 * Split a JSON path suffix like `.a.b[0].c` or `[0].name` into segments.
 * Returns null when the text is not a valid dot/bracket path.
 */
function parsePathSegments(suffix: string): Array<string | number> | null {
  const segments: Array<string | number> = []
  const re = /\.([^.[\]]+)|\[(\d+)\]/g
  let consumed = 0
  for (const match of suffix.matchAll(re)) {
    if (match.index !== consumed) return null
    if (match[1] !== undefined) segments.push(match[1])
    else segments.push(Number(match[2]))
    consumed = match.index + match[0].length
  }
  return consumed === suffix.length ? segments : null
}

function resolveJsonPath(root: unknown, segments: Array<string | number>): unknown {
  let current: unknown = root
  for (const seg of segments) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string | number, unknown>)[seg]
  }
  return current
}

function stringifyValue(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

export function extractCaptures(
  captures: KeyValue[],
  response: { status: number; headers: Array<{ name: string; value: string }>; body: string }
): Array<{ name: string; value: string }> {
  const out: Array<{ name: string; value: string }> = []
  let parsedBody: unknown
  let bodyParsed = false

  for (const row of captures) {
    if (row.enabled === false) continue
    const name = row.name.trim()
    const path = row.value.trim()
    if (!name || !path) continue

    if (path === 'status') {
      out.push({ name, value: String(response.status) })
      continue
    }

    if (path.startsWith('header.')) {
      const wanted = path.slice('header.'.length).trim().toLowerCase()
      if (!wanted) continue
      const header = response.headers.find((h) => h.name.toLowerCase() === wanted)
      if (header) out.push({ name, value: header.value })
      continue
    }

    if (path === 'body') {
      out.push({ name, value: response.body })
      continue
    }

    if (path.startsWith('body.') || path.startsWith('body[')) {
      const segments = parsePathSegments(path.slice('body'.length))
      if (!segments || !segments.length) continue
      if (!bodyParsed) {
        bodyParsed = true
        try {
          parsedBody = JSON.parse(response.body)
        } catch {
          parsedBody = undefined
        }
      }
      const value = stringifyValue(resolveJsonPath(parsedBody, segments))
      if (value !== undefined) out.push({ name, value })
      continue
    }

    // Unknown path shape — unresolvable, skip.
  }

  return out
}
