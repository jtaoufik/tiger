/**
 * Parse a pasted curl command into a request. Covers the flags people
 * actually copy from browsers and docs: -X, -H, --data variants, --json,
 * -F (multipart, `@path` for files), -G, -u, -b (cookie), -A, -e, the URL.
 */

import { emptyBody, isHttpMethod, type KeyValue, type TigerRequest } from '../types'

/**
 * Flags that take a following value we don't model but must consume, so the
 * value can never be mistaken for the URL.
 */
const VALUE_FLAGS = new Set([
  '-o',
  '--output',
  '--connect-timeout',
  '-m',
  '--max-time',
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
  let json = false
  let getWithData = false
  const form: string[] = []
  const addHeader = (name: string, value: string) => headers.push({ name, value, enabled: true })

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
      const chunk = parts[++i] ?? ''
      // Repeated -d flags are joined with & like curl does.
      body = body === null ? chunk : `${body}&${chunk}`
    } else if (arg === '--json') {
      body = parts[++i] ?? ''
      json = true
    } else if (arg === '-G' || arg === '--get') getWithData = true
    else if (arg === '-A' || arg === '--user-agent') addHeader('User-Agent', parts[++i] ?? '')
    else if (arg === '-e' || arg === '--referer') addHeader('Referer', parts[++i] ?? '')
    else if (arg === '-b' || arg === '--cookie') {
      const value = parts[++i] ?? ''
      // A value without "=" is a cookie FILE name, which we cannot read.
      if (value.includes('=')) addHeader('Cookie', value)
    } else if (arg === '-u' || arg === '--user') basic = parts[++i] ?? ''
    else if (arg === '--url') url = parts[++i] ?? ''
    else if (arg === '-F' || arg === '--form' || arg === '--form-string') {
      const raw = parts[++i] ?? ''
      const idx = raw.indexOf('=')
      if (idx > 0) {
        const name = raw.slice(0, idx)
        const value = raw.slice(idx + 1)
        // `name=@path;type=...` uploads a file; `<path` reads a file as text.
        const file = arg !== '--form-string' && value.startsWith('@')
        form.push(file ? `${name}: @file:${value.slice(1).split(';')[0]}` : `${name}: ${value}`)
      }
    }
    else if (arg.startsWith('-')) {
      // Other flags that take a value: consume it so the value never becomes
      // the URL. (Bare flags fall through and are simply ignored.)
      if (VALUE_FLAGS.has(arg)) i++
    } else if (!url) {
      url = arg
    }
  }

  if (!url) return null
  if (getWithData && body !== null) {
    url += (url.includes('?') ? '&' : '?') + body
    body = null
  }
  if (!method) method = body !== null || form.length ? 'post' : 'get'
  if (!isHttpMethod(method)) return null

  const contentType = headers.find((h) => h.name.toLowerCase() === 'content-type')?.value ?? ''
  const request: TigerRequest = {
    name: `Imported from curl`,
    method,
    url,
    headers,
    query: [],
    body: form.length
      ? { type: 'multipart', content: form.join('\n') }
      : body === null
        ? emptyBody()
        : {
            type: json || contentType.includes('json') || /^\s*[{[]/.test(body) ? 'json' : 'text',
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
