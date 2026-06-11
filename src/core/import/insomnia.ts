/**
 * Import an Insomnia v4 export. Insomnia stores a flat `resources` array where
 * folders (`request_group`) reference parents by id, so we rebuild the folder
 * path by walking the parent chain.
 */

import { emptyBody, isHttpMethod, type KeyValue, type TigerBody } from '../types'
import type { ImportResult, ImportedRequest } from './types'

type Json = Record<string, unknown>

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function toKeyValues(raw: unknown): KeyValue[] {
  return (Array.isArray(raw) ? raw : [])
    .map((entry) => entry as Json)
    .filter((e) => typeof e.name === 'string')
    .map((e) => ({ name: str(e.name), value: str(e.value), enabled: e.disabled !== true }))
}

function toBody(raw: unknown): TigerBody {
  const body = (raw ?? {}) as Json
  const mime = str(body.mimeType)
  if (mime === 'application/json') return { type: 'json', content: str(body.text) }
  if (mime === 'application/graphql') {
    // Insomnia stores GraphQL as a JSON envelope { query, variables } in `text`.
    const text = str(body.text)
    try {
      const parsed = JSON.parse(text) as { query?: unknown; variables?: unknown }
      const content = typeof parsed.query === 'string' ? parsed.query : ''
      const variables =
        parsed.variables === undefined ? undefined : JSON.stringify(parsed.variables)
      return variables !== undefined
        ? { type: 'graphql', content, variables }
        : { type: 'graphql', content }
    } catch {
      // Not a JSON envelope — treat the raw text as the query document.
      return { type: 'graphql', content: text }
    }
  }
  if (mime === 'application/xml' || mime === 'text/xml') {
    return { type: 'xml', content: str(body.text) }
  }
  if (mime === 'application/x-www-form-urlencoded') {
    const content = (Array.isArray(body.params) ? body.params : [])
      .map((p) => p as Json)
      .map((p) => `${p.disabled === true ? '~' : ''}${str(p.name)}: ${str(p.value)}`)
      .join('\n')
    return { type: 'form', content }
  }
  if (mime.startsWith('text/')) return { type: 'text', content: str(body.text) }
  return emptyBody()
}

export function importInsomnia(raw: unknown): ImportResult {
  const doc = (raw ?? {}) as Json
  const resources = (Array.isArray(doc.resources) ? doc.resources : []).map((r) => r as Json)

  const groups = new Map<string, { name: string; parentId: string }>()
  for (const r of resources) {
    if (r._type === 'request_group') {
      groups.set(str(r._id), { name: str(r.name), parentId: str(r.parentId) })
    }
  }

  const pathOf = (parentId: string): string[] => {
    const path: string[] = []
    let cursor = parentId
    while (cursor && groups.has(cursor)) {
      const group = groups.get(cursor)!
      path.unshift(group.name)
      cursor = group.parentId
    }
    return path
  }

  const requests: ImportedRequest[] = []
  for (const r of resources) {
    if (r._type !== 'request') continue
    const method = str(r.method, 'GET').toLowerCase()
    if (!isHttpMethod(method)) continue
    requests.push({
      path: pathOf(str(r.parentId)),
      request: {
        name: str(r.name, 'Request'),
        method,
        url: str(r.url),
        headers: toKeyValues(r.headers),
        query: toKeyValues(r.parameters),
        body: toBody(r.body)
      }
    })
  }

  // Note: avoid a literal ending in the bare word "import" here — electron-vite's
  // esm-shim plugin pattern-matches it as an import statement and corrupts the chunk.
  return { name: 'Insomnia collection', source: 'insomnia', requests }
}
