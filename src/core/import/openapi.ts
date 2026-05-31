/**
 * Import an OpenAPI 3 / Swagger 2 document. Operations become requests, grouped
 * into folders by their first tag (falling back to the first path segment).
 */

import { emptyBody, isHttpMethod, type KeyValue, type TigerRequest } from '../types'
import type { ImportResult, ImportedRequest } from './types'

type Json = Record<string, unknown>

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function baseUrl(doc: Json): string {
  const servers = doc.servers
  if (Array.isArray(servers) && servers[0] && typeof (servers[0] as Json).url === 'string') {
    return (servers[0] as Json).url as string
  }
  // Swagger 2
  const host = str(doc.host)
  if (host) {
    const scheme = Array.isArray(doc.schemes) ? str(doc.schemes[0], 'https') : 'https'
    return `${scheme}://${host}${str(doc.basePath)}`
  }
  return '{{baseUrl}}'
}

function paramsOf(operation: Json, where: string): KeyValue[] {
  const params = Array.isArray(operation.parameters) ? operation.parameters : []
  return params
    .map((p) => p as Json)
    .filter((p) => p.in === where)
    .map((p) => ({
      name: str(p.name),
      value: str((p.example ?? (p.schema as Json)?.example) as string),
      enabled: p.required === true
    }))
}

function bodyOf(operation: Json): TigerRequest['body'] {
  const rb = operation.requestBody as Json | undefined
  const json = (rb?.content as Json)?.['application/json'] as Json | undefined
  if (!json) return emptyBody()
  const example = json.example ?? (json.schema as Json)?.example
  return {
    type: 'json',
    content: example !== undefined ? JSON.stringify(example, null, 2) : '{}'
  }
}

export function importOpenApi(raw: unknown): ImportResult {
  const doc = (raw ?? {}) as Json
  const info = (doc.info ?? {}) as Json
  const base = baseUrl(doc)
  const paths = (doc.paths ?? {}) as Json
  const requests: ImportedRequest[] = []

  for (const [path, methodsRaw] of Object.entries(paths)) {
    const methods = (methodsRaw ?? {}) as Json
    for (const [method, opRaw] of Object.entries(methods)) {
      if (!isHttpMethod(method)) continue
      const op = (opRaw ?? {}) as Json
      const tag = Array.isArray(op.tags) ? str(op.tags[0]) : ''
      const folder = tag || path.split('/').filter(Boolean)[0] || ''
      requests.push({
        path: folder ? [folder] : [],
        request: {
          name: str(op.summary) || str(op.operationId) || `${method.toUpperCase()} ${path}`,
          method,
          url: `${base}${path}`,
          query: paramsOf(op, 'query'),
          headers: paramsOf(op, 'header'),
          body: bodyOf(op)
        }
      })
    }
  }

  return { name: str(info.title, 'OpenAPI collection'), source: 'openapi', requests }
}
