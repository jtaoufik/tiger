/**
 * Turn a `TigerRequest` plus a variable map into a concrete, fetch-ready
 * request: tokens resolved, auth + query applied, body encoded and a default
 * Content-Type chosen when the request does not set one.
 */

import { applyAuth } from './auth'
import { interpolate, type VarMap } from './interpolate'
import { parseKeyValues } from './tigerFormat'
import type { TigerRequest } from './types'

export interface BuiltRequest {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
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
  return url + (url.includes('?') ? '&' : '?') + qs
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
    headers[interpolate(h.name, vars)] = interpolate(h.value, vars)
  }

  let body: string | undefined
  if (req.body.type !== 'none' && !METHODS_WITHOUT_BODY.has(method)) {
    if (req.body.type === 'json') {
      body = interpolate(req.body.content, vars)
      if (!hasHeader(headers, 'content-type')) headers['Content-Type'] = 'application/json'
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
    }
  }

  return { method, url, headers, body }
}
