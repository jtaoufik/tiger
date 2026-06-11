/**
 * Import a Postman collection (schema v2.0 / v2.1). Postman already uses the
 * `{{variable}}` syntax, so variables carry over untouched.
 */

import { emptyBody, isHttpMethod, type KeyValue, type TigerBody, type TigerRequest } from '../types'
import type { ImportResult, ImportedRequest } from './types'

type Json = Record<string, unknown>

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function toKeyValues(raw: unknown): KeyValue[] {
  return asArray(raw)
    .map((entry) => {
      const e = entry as Json
      if (typeof e.key !== 'string') return null
      return { name: e.key, value: str(e.value), enabled: e.disabled !== true }
    })
    .filter((kv): kv is KeyValue => kv !== null)
}

function splitUrl(url: unknown): { url: string; query: KeyValue[] } {
  if (typeof url === 'string') {
    const [base] = url.split('?')
    return { url: base, query: [] }
  }
  const u = (url ?? {}) as Json
  const raw = str(u.raw)
  const base = raw.split('?')[0]
  return { url: base || raw, query: toKeyValues(u.query) }
}

function toBody(raw: unknown): TigerBody {
  const body = (raw ?? {}) as Json
  const mode = str(body.mode)

  if (mode === 'raw') {
    const language = str(((body.options as Json)?.raw as Json)?.language).toLowerCase()
    return { type: language === 'json' ? 'json' : 'text', content: str(body.raw) }
  }
  if (mode === 'urlencoded' || mode === 'formdata') {
    const items = toKeyValues(body[mode])
    const content = items
      .map((kv) => `${kv.enabled ? '' : '~'}${kv.name}: ${kv.value}`)
      .join('\n')
    return { type: 'form', content }
  }
  if (mode === 'graphql') {
    const gql = (body.graphql ?? {}) as Json
    const variables = str(gql.variables)
    return {
      type: 'graphql',
      content: str(gql.query),
      ...(variables.trim() ? { variables } : {})
    }
  }
  return emptyBody()
}

function toRequest(name: string, request: unknown): TigerRequest | null {
  const r = (request ?? {}) as Json
  const method = str(r.method, 'GET').toLowerCase()
  if (!isHttpMethod(method)) return null

  const { url, query } = splitUrl(r.url)
  return {
    name,
    method,
    url,
    headers: toKeyValues(r.header),
    query,
    body: toBody(r.body)
  }
}

function walk(items: unknown[], path: string[], out: ImportedRequest[]): void {
  let seq = 1
  for (const item of items) {
    const node = (item ?? {}) as Json
    const name = str(node.name, 'Untitled')
    if (Array.isArray(node.item)) {
      walk(node.item, [...path, name], out)
    } else if (node.request) {
      const request = toRequest(name, node.request)
      if (request) {
        request.seq = seq++
        out.push({ path, request })
      }
    }
  }
}

export function importPostman(raw: unknown): ImportResult {
  const root = (raw ?? {}) as Json
  const info = (root.info ?? {}) as Json
  const requests: ImportedRequest[] = []
  walk(asArray(root.item), [], requests)
  return {
    name: str(info.name, 'Imported collection'),
    source: 'postman',
    requests
  }
}
