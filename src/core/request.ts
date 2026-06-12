/**
 * Turn a `TigerRequest` plus a variable map into a concrete, fetch-ready
 * request: tokens resolved, auth + query applied, body encoded and a default
 * Content-Type chosen when the request does not set one.
 */

import { applyAuth } from './auth'
import { interpolate, type VarMap } from './interpolate'
import { parseMultipartContent } from './multipart'
import { parseKeyValues } from './tigerFormat'
import type { TigerRequest } from './types'

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

const METHODS_WITHOUT_BODY = new Set(['GET', 'HEAD'])

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lower = name.toLowerCase()
  return Object.keys(headers).some((k) => k.toLowerCase() === lower)
}

function applyQuery(url: string, resolved: Array<{ name: string; value: string }>): string {
  if (!resolved.length) return url
  const qs = resolved
    .map((q) => `${encodeURIComponent(q.name)}=${encodeURIComponent(q.value)}`)
    .join('&')
  // A trailing #fragment must stay at the very end of the URL, so split it off
  // before appending the query string and reattach it afterwards.
  const hashIdx = url.indexOf('#')
  const base = hashIdx === -1 ? url : url.slice(0, hashIdx)
  const fragment = hashIdx === -1 ? '' : url.slice(hashIdx)
  return base + (base.includes('?') ? '&' : '?') + qs + fragment
}

export function buildRequest(req: TigerRequest, vars: VarMap = {}): BuiltRequest {
  const method = req.method.toUpperCase()
  const auth = applyAuth(req.auth, vars)

  const resolvedQuery = [
    ...req.query
      .filter((q) => q.enabled !== false)
      .map((q) => ({ name: interpolate(q.name, vars), value: interpolate(q.value, vars) })),
    ...auth.query.map((q) => ({ name: q.name, value: q.value }))
  ]
  const url = applyQuery(interpolate(req.url, vars), resolvedQuery)

  // Auth headers go first so an explicit request header can still override them.
  const headers: Record<string, string> = { ...auth.headers }
  for (const h of req.headers) {
    if (h.enabled === false) continue
    const name = interpolate(h.name, vars)
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
  if (req.body.type !== 'none' && !METHODS_WITHOUT_BODY.has(method)) {
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
