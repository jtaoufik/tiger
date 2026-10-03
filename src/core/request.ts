/**
 * Turn a `TigerRequest` plus a variable map into a concrete, fetch-ready
 * request: tokens resolved, auth + query applied, body encoded and a default
 * Content-Type chosen when the request does not set one.
 */

import { applyAuth } from './auth'
import { interpolate, type VarMap } from './interpolate'
import { parseMultipartContent } from './multipart'
import { parseKeyValues } from './tigerFormat'
import type { TigerBody, TigerRequest } from './types'

export interface BuiltRequest {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
  /**
   * multipart/form-data parts (file rows carry the file PATH; the sender reads
   * the bytes and assembles the body with a boundary at send time).
   */
  multipart?: Array<{ name: string; value: string; isFile: boolean }>
}

/** Methods that usually carry no body: theirs is sent only when it holds something. */
const METHODS_WITHOUT_BODY = new Set(['GET', 'HEAD'])

/** True when a body holds something to send (a field, or non-blank text). */
function hasContent(body: TigerBody): boolean {
  if (body.type === 'form') return parseKeyValues(body.content).some((kv) => kv.enabled !== false)
  if (body.type === 'multipart') {
    return parseMultipartContent(body.content).some((row) => row.enabled !== false && row.name)
  }
  return body.content.trim() !== ''
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lower = name.toLowerCase()
  return Object.keys(headers).some((k) => k.toLowerCase() === lower)
}

/**
 * Percent-encode a query name or value. Escapes the text already holds (%3A,
 * from a pasted URL or a Postman, Insomnia or Bruno import) are kept as they
 * are, as those tools do, instead of being encoded a second time; a % that
 * starts no escape is encoded like everything else that would change the query.
 */
function encodeQueryPart(text: string): string {
  return text
    .split(/(%[0-9A-Fa-f]{2})/)
    .map((part, i) => (i % 2 ? part : encodeURIComponent(part)))
    .join('')
}

function applyQuery(url: string, resolved: Array<{ name: string; value: string }>): string {
  if (!resolved.length) return url
  const qs = resolved.map((q) => `${encodeQueryPart(q.name)}=${encodeQueryPart(q.value)}`).join('&')
  // A trailing #fragment must stay at the very end of the URL, so split it off
  // before appending the query string and reattach it afterwards.
  const hashIdx = url.indexOf('#')
  const base = hashIdx === -1 ? url : url.slice(0, hashIdx)
  const fragment = hashIdx === -1 ? '' : url.slice(hashIdx)
  return base + (base.includes('?') ? '&' : '?') + qs + fragment
}

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i
/** host[:port] then the end, a path, a query or a fragment: localhost:8080/x, api.test, [::1]:3000. */
const BARE_HOST = /^(\[[0-9a-f:.]+\]|[^\s/?#{}:@[\]]+)(:\d+)?([/?#]|$)/i

/**
 * A URL typed without a scheme (127.0.0.1:3000/x, localhost:8080/x, api.test/x)
 * goes out over http://, as in Postman, Insomnia and Bruno. Anything else, such
 * as an unresolved {{variable}} or a bare path, is left as typed so the error
 * names what is missing.
 */
function withDefaultScheme(url: string): string {
  if (HAS_SCHEME.test(url)) return url
  if (url.startsWith('//')) return `http:${url}`
  return BARE_HOST.test(url) ? `http://${url}` : url
}

export function buildRequest(req: TigerRequest, vars: VarMap = {}): BuiltRequest {
  const method = req.method.toUpperCase()
  const auth = applyAuth(req.auth, vars)

  // A row with a value but no name (the editor lets you type the value first)
  // is skipped: an empty header name fails the whole send.
  const resolvedQuery = [
    ...req.query
      .filter((q) => q.enabled !== false)
      .map((q) => ({ name: interpolate(q.name, vars), value: interpolate(q.value, vars) })),
    ...auth.query.map((q) => ({ name: q.name, value: q.value }))
  ].filter((q) => q.name.trim())
  const url = applyQuery(withDefaultScheme(interpolate(req.url, vars)), resolvedQuery)

  // Auth headers go first so an explicit request header can still override them.
  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(auth.headers)) if (name.trim()) headers[name] = value
  for (const h of req.headers) {
    if (h.enabled === false) continue
    const name = interpolate(h.name, vars)
    if (!name.trim()) continue
    // Drop any existing header with the same name (case-insensitively) first, so
    // a request header like 'authorization' overrides an auth-block
    // 'Authorization' and only a single value is sent.
    const lower = name.toLowerCase()
    for (const key of Object.keys(headers)) {
      if (key !== name && key.toLowerCase() === lower) delete headers[key]
    }
    headers[name] = interpolate(h.value, vars)
  }

  let body: string | undefined
  let multipart: BuiltRequest['multipart']
  // A body set on a GET or HEAD goes out too (an Elasticsearch search, say), as
  // in Postman, Insomnia and curl; an empty one there adds nothing at all.
  if (req.body.type !== 'none' && (!METHODS_WITHOUT_BODY.has(method) || hasContent(req.body))) {
    if (req.body.type === 'json') {
      body = interpolate(req.body.content, vars)
      if (!hasHeader(headers, 'content-type')) headers['Content-Type'] = 'application/json'
    } else if (req.body.type === 'xml') {
      // SOAP and plain XML; SOAP 1.1 also wants a SOAPAction header, which the
      // request sets explicitly when needed.
      body = interpolate(req.body.content, vars)
      if (!hasHeader(headers, 'content-type')) headers['Content-Type'] = 'text/xml'
    } else if (req.body.type === 'text') {
      body = interpolate(req.body.content, vars)
      if (!hasHeader(headers, 'content-type')) headers['Content-Type'] = 'text/plain'
    } else if (req.body.type === 'form') {
      const params = new URLSearchParams()
      for (const kv of parseKeyValues(req.body.content)) {
        if (kv.enabled === false) continue
        params.append(interpolate(kv.name, vars), interpolate(kv.value, vars))
      }
      body = params.toString()
      if (!hasHeader(headers, 'content-type')) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
      }
    } else if (req.body.type === 'graphql') {
      // GraphQL-over-HTTP: a JSON envelope of { query, variables? }.
      const query = interpolate(req.body.content, vars)
      let variables: unknown
      const varsText = interpolate(req.body.variables ?? '', vars)
      if (varsText.trim()) {
        try {
          variables = JSON.parse(varsText)
        } catch {
          variables = undefined // unparsable variables are omitted, not sent broken
        }
      }
      body = JSON.stringify(variables === undefined ? { query } : { query, variables })
      if (!hasHeader(headers, 'content-type')) headers['Content-Type'] = 'application/json'
    } else if (req.body.type === 'multipart') {
      // The Content-Type (with boundary) is set by the sender when assembling.
      multipart = parseMultipartContent(req.body.content)
        .filter((row) => row.enabled !== false && row.name)
        .map((row) => ({
          name: interpolate(row.name, vars),
          value: interpolate(row.value, vars),
          isFile: row.isFile
        }))
    }
  }

  return multipart ? { method, url, headers, body, multipart } : { method, url, headers, body }
}
