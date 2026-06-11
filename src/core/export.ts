/**
 * Export Tiger requests to a Postman v2.1 collection. Folder paths become nested
 * Postman item groups, so a Tiger collection round-trips back through importer.
 */

import type { ImportedRequest } from './import/types'
import type { KeyValue, TigerEnvironment, TigerRequest } from './types'

interface PostmanItem {
  name: string
  item?: PostmanItem[]
  request?: unknown
}

function mapKeyValues(items: KeyValue[]): unknown[] {
  return items.map((kv) => ({
    key: kv.name,
    value: kv.value,
    ...(kv.enabled === false ? { disabled: true } : {})
  }))
}

function toPostmanUrl(req: TigerRequest): unknown {
  const enabledQuery = req.query.filter((q) => q.name)
  const qs = enabledQuery
    .filter((q) => q.enabled !== false)
    .map((q) => `${q.name}=${q.value}`)
    .join('&')
  // The URL may already carry a `?query`; merge our params onto it with the
  // correct separator instead of blindly appending a second `?`.
  const sep = req.url.includes('?') ? '&' : '?'
  return {
    raw: qs ? `${req.url}${sep}${qs}` : req.url,
    query: enabledQuery.length ? mapKeyValues(enabledQuery) : undefined
  }
}

function toPostmanBody(req: TigerRequest): unknown {
  if (req.body.type === 'json' || req.body.type === 'text' || req.body.type === 'xml') {
    return {
      mode: 'raw',
      raw: req.body.content,
      options: { raw: { language: req.body.type } }
    }
  }
  if (req.body.type === 'graphql') {
    return {
      mode: 'graphql',
      graphql: {
        query: req.body.content,
        ...(req.body.variables?.trim() ? { variables: req.body.variables } : {})
      }
    }
  }
  if (req.body.type === 'form') {
    const pairs = req.body.content
      .split('\n')
      .filter((l) => l.trim())
      .map((line) => {
        const disabled = line.trimStart().startsWith('~')
        const l = disabled ? line.trim().slice(1) : line
        const idx = l.indexOf(':')
        return {
          key: idx === -1 ? l.trim() : l.slice(0, idx).trim(),
          value: idx === -1 ? '' : l.slice(idx + 1).trim(),
          ...(disabled ? { disabled: true } : {})
        }
      })
    return { mode: 'urlencoded', urlencoded: pairs }
  }
  return undefined
}

function toPostmanRequest(req: TigerRequest): unknown {
  return {
    method: req.method.toUpperCase(),
    header: mapKeyValues(req.headers),
    url: toPostmanUrl(req),
    ...(req.body.type !== 'none' ? { body: toPostmanBody(req) } : {})
  }
}

function ensureFolder(root: PostmanItem[], path: string[]): PostmanItem[] {
  let level = root
  for (const segment of path) {
    let folder = level.find((item) => item.item && item.name === segment)
    if (!folder) {
      folder = { name: segment, item: [] }
      level.push(folder)
    }
    level = folder.item!
  }
  return level
}

export function exportPostman(
  name: string,
  requests: ImportedRequest[],
  environment?: TigerEnvironment | null
): unknown {
  const root: PostmanItem[] = []
  for (const { path, request } of requests) {
    ensureFolder(root, path).push({
      name: request.name,
      request: toPostmanRequest(request)
    })
  }
  const collection: Record<string, unknown> = {
    info: {
      name,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: root
  }
  // Embed the active environment as collection variables so a single exported
  // file carries its {{variables}} too.
  if (environment && environment.variables.length) {
    collection.variable = environment.variables.map((v) => ({
      key: v.name,
      value: v.value,
      ...(v.enabled === false ? { disabled: true } : {})
    }))
  }
  return collection
}

/** Reduce a Tiger URL to an OpenAPI path: drop a leading {{base}}, host and query. */
function toApiPath(url: string): string {
  let p = url.replace(/^\{\{[^}]+\}\}/, '')
  const m = p.match(/^[a-z][a-z0-9+.-]*:\/\/[^/]+(\/.*)?$/i)
  if (m) p = m[1] ?? '/'
  p = p.split('?')[0].split('#')[0]
  if (!p.startsWith('/')) p = `/${p}`
  return p || '/'
}

const OPENAPI_CONTENT_TYPE: Record<string, string> = {
  json: 'application/json',
  graphql: 'application/json',
  xml: 'application/xml',
  text: 'text/plain',
  form: 'application/x-www-form-urlencoded'
}

/**
 * Export Tiger requests as an OpenAPI 3.0 document. Each request becomes an
 * operation under its URL path, with query/header parameters and a request body
 * for methods that carry one. Variable references are kept verbatim.
 */
export function exportOpenApi(name: string, requests: ImportedRequest[]): unknown {
  const paths: Record<string, Record<string, unknown>> = {}

  for (const { request } of requests) {
    const apiPath = toApiPath(request.url)
    const method = request.method.toLowerCase()
    const parameters = [
      ...request.query
        .filter((q) => q.name && q.enabled !== false)
        .map((q) => ({ name: q.name, in: 'query', schema: { type: 'string' }, example: q.value })),
      ...request.headers
        .filter((h) => h.name && h.enabled !== false)
        .map((h) => ({ name: h.name, in: 'header', schema: { type: 'string' }, example: h.value }))
    ]

    const operation: Record<string, unknown> = {
      summary: request.name,
      operationId: request.name.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '') || method,
      responses: { '200': { description: 'OK' } }
    }
    if (parameters.length) operation.parameters = parameters
    if (request.docs?.trim()) operation.description = request.docs

    if (request.body.type !== 'none' && !['get', 'head'].includes(method) && request.body.content.trim()) {
      const ct = OPENAPI_CONTENT_TYPE[request.body.type] ?? 'text/plain'
      operation.requestBody = {
        content: { [ct]: { example: request.body.content } }
      }
    }

    paths[apiPath] = { ...(paths[apiPath] ?? {}), [method]: operation }
  }

  return {
    openapi: '3.0.3',
    info: { title: name, version: '1.0.0' },
    servers: [{ url: '{{baseUrl}}' }],
    paths
  }
}

/** Export an environment as a Postman environment file (re-importable). */
export function exportPostmanEnvironment(env: TigerEnvironment): unknown {
  return {
    name: env.name,
    values: env.variables.map((v) => ({
      key: v.name,
      value: v.value,
      type: v.secret ? 'secret' : 'default',
      enabled: v.enabled !== false
    })),
    _postman_variable_scope: 'environment'
  }
}
