/**
 * Parse a pasted curl command into a request. Covers the flags people
 * actually copy from browsers and docs: -X, -H, --data variants, -u, the URL.
 */

import { emptyBody, isHttpMethod, type KeyValue, type TigerRequest } from '../types'

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
      arg === '--data-ascii'
    ) {
      body = parts[++i] ?? ''
    } else if (arg === '-u' || arg === '--user') basic = parts[++i] ?? ''
    else if (arg === '--url') url = parts[++i] ?? ''
    else if (arg === '-F' || arg === '--form') i++ // unsupported, skip value
    else if (arg.startsWith('-')) {
      // Flags with values we ignore entirely.
      if (['-o', '--output', '-A', '--user-agent', '-e', '--referer', '--connect-timeout', '-m', '--max-time'].includes(arg)) i++
    } else if (!url)

      url = arg
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
