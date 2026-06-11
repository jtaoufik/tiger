/**
 * Parse a pasted curl command into a request. Covers the flags people
 * actually copy from browsers and docs: -X, -H, --data variants, -u, the URL.
 */

import { emptyBody, isHttpMethod, type KeyValue, type TigerRequest } from '../types'

/**
 * Flags that take a following value we don't model but must consume, so the
 * value can never be mistaken for the URL.
 */
const VALUE_FLAGS = new Set([
  '-o',
  '--output',
  '-A',
  '--user-agent',
  '-e',
  '--referer',
  '--connect-timeout',
  '-m',
  '--max-time',
  '-b',
  '--cookie',
  '-c',
  '--cookie-jar',
  '-w',
  '--write-out',
  '-T',
  '--upload-file',
  '--retry',
  '--max-redirs',
  '-x',
  '--proxy',
  '-E',
  '--cert',
  '--key',
  '--cacert',
  '--header-file',
  '--resolve'
])

/** Split respecting single/double quotes and line continuations. */
function tokens(input: string): string[] {
  const out: string[] = []
  const re = /'([^']*)'|"((?:[^"\\]|\\.)*)"|(\\\n)|(\S+)/g
  for (const m of input.matchAll(re)) {
    if (m[3] !== undefined) continue
    out.push(m[1] ?? m[2]?.replace(/\\(.)/g, '$1') ?? m[4]!)
  }
  return out
}

export function importCurl(command: string): TigerRequest | null {
  const parts = tokens(command.trim())
  if (parts[0] !== 'curl') return null

  let method = ''
  let url = ''
  const headers: KeyValue[] = []
  let body: string | null = null
  let basic: string | null = null

  for (let i = 1; i < parts.length; i++) {
    const arg = parts[i]
    if (arg === '-X' || arg === '--request') method = parts[++i]?.toLowerCase() ?? ''
    else if (arg === '-H' || arg === '--header') {
      const raw = parts[++i] ?? ''
      const idx = raw.indexOf(':')
      if (idx > 0) headers.push({ name: raw.slice(0, idx).trim(), value: raw.slice(idx + 1).trim(), enabled: true })
    } else if (
      arg === '-d' ||
      arg === '--data' ||
      arg === '--data-raw' ||
      arg === '--data-binary' ||
      arg === '--data-ascii' ||
      arg === '--data-urlencode'
    ) {
      // --data-urlencode is a body source too; we keep the raw value (already
      // urlencoded by the author, or a literal we send as-is).
      body = parts[++i] ?? ''
    } else if (arg === '-u' || arg === '--user') basic = parts[++i] ?? ''
    else if (arg === '--url') url = parts[++i] ?? ''
    else if (arg === '-F' || arg === '--form') i++ // unsupported, skip value
    else if (arg.startsWith('-')) {
      // Other flags that take a value: consume it so the value never becomes
      // the URL. (Bare flags fall through and are simply ignored.)
      if (VALUE_FLAGS.has(arg)) i++
    } else if (!url) {
      url = arg
    }
  }

  if (!url) return null
  if (!method) method = body !== null ? 'post' : 'get'
  if (!isHttpMethod(method)) return null

  const contentType = headers.find((h) => h.name.toLowerCase() === 'content-type')?.value ?? ''
  const request: TigerRequest = {
    name: `Imported from curl`,
    method,
    url,
    headers,
    query: [],
    body:
      body === null
        ? emptyBody()
        : {
            type: contentType.includes('json') || /^\s*[{[]/.test(body) ? 'json' : 'text',
            content: body
          }
  }
  if (basic) {
    const idx = basic.indexOf(':')
    request.auth = {
      type: 'basic',
      username: idx === -1 ? basic : basic.slice(0, idx),
      password: idx === -1 ? '' : basic.slice(idx + 1)
    }
  }
  return request
}
