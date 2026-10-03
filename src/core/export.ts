/**
 * Export Tiger requests to a Postman v2.1 collection. Folder paths become nested
 * Postman item groups, so a Tiger collection round-trips back through importer:
 * auth (request, folder, collection), scripts, docs and every body type.
 */

import type { ImportedFolder, ImportedRequest } from './import/types'
import { parseMultipartContent } from './multipart'
import type { KeyValue, TigerAuth, TigerEnvironment, TigerRequest } from './types'

interface PostmanItem {
  name: string
  item?: PostmanItem[]
  request?: unknown
  auth?: unknown
  description?: string
  event?: unknown[]
}

/** Collection and folder settings, which live outside the requests. */
export interface PostmanExportSettings {
  auth?: TigerAuth
  docs?: string
  folders?: ImportedFolder[]
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
  // Postman reads the query list, not `raw`: a query written in the URL goes
  // in the list too (`value: null` for a bare `flag`), or a re-import drops it.
  const idx = req.url.indexOf('?')
  const inline =
    idx === -1
      ? []
      : req.url
          .slice(idx + 1)
          .split('#')[0]
          .split('&')
          .filter(Boolean)
          .map((pair) => {
            const at = pair.indexOf('=')
            return at === -1 ? { key: pair, value: null } : { key: pair.slice(0, at), value: pair.slice(at + 1) }
          })
  const query = [...inline, ...mapKeyValues(enabledQuery)]
  return {
    raw: qs ? `${req.url}${sep}${qs}` : req.url,
    query: query.length ? query : undefined
  }
}

/** Tiger auth in Postman's shape: the inverse of the importer's `toAuth`. */
function toPostmanAuth(auth: TigerAuth): unknown {
  const params = (values: Record<string, string>) =>
    Object.entries(values).map(([key, value]) => ({ key, value, type: 'string' }))
  switch (auth.type) {
    case 'none':
      return { type: 'noauth' }
    case 'bearer':
      return { type: 'bearer', bearer: params({ token: auth.token }) }
    case 'basic':
      return { type: 'basic', basic: params({ username: auth.username, password: auth.password }) }
    case 'apikey':
      return { type: 'apikey', apikey: params({ key: auth.key, value: auth.value, in: auth.in }) }
    case 'oauth2':
      return {
        type: 'oauth2',
        oauth2: params({
          grant_type: 'client_credentials',
          accessTokenUrl: auth.tokenUrl,
          clientId: auth.clientId,
          clientSecret: auth.clientSecret,
          scope: auth.scope,
          // Tiger sends the client credentials as a Basic header.
          client_authentication: 'header'
        })
      }
  }
}

/** Pre-request and test scripts as Postman item events. */
function toPostmanEvents(req: TigerRequest): unknown[] | undefined {
  const event = (listen: string, source?: string) =>
    source?.trim() ? [{ listen, script: { type: 'text/javascript', exec: source.split('\n') } }] : []
  const events = [...event('prerequest', req.preScript), ...event('test', req.postScript)]
  return events.length ? events : undefined
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
  if (req.body.type === 'multipart') {
    return {
      mode: 'formdata',
      formdata: parseMultipartContent(req.body.content).map((row) => ({
        key: row.name,
        ...(row.isFile ? { type: 'file', src: row.value } : { type: 'text', value: row.value }),
        ...(row.enabled === false ? { disabled: true } : {})
      }))
    }
  }
  return undefined
}

function toPostmanRequest(req: TigerRequest): unknown {
  return {
    method: req.method.toUpperCase(),
    header: mapKeyValues(req.headers),
    url: toPostmanUrl(req),
    ...(req.body.type !== 'none' ? { body: toPostmanBody(req) } : {}),
    ...(req.auth ? { auth: toPostmanAuth(req.auth) } : {}),
    ...(req.docs?.trim() ? { description: req.docs } : {})
  }
}

/** The item group at `path`, created (with its parents) when missing. */
function ensureFolder(root: PostmanItem[], path: string[]): PostmanItem | undefined {
  let level = root
  let folder: PostmanItem | undefined
  for (const segment of path) {
    folder = level.find((item) => item.item && item.name === segment)
    if (!folder) {
      folder = { name: segment, item: [] }
      level.push(folder)
    }
    level = folder.item!
  }
  return folder
}

export function exportPostman(
  name: string,
  requests: ImportedRequest[],
  environment?: TigerEnvironment | null,
  settings: PostmanExportSettings = {}
): unknown {
  const root: PostmanItem[] = []
  for (const { path, request } of requests) {
    const events = toPostmanEvents(request)
    ;(ensureFolder(root, path)?.item ?? root).push({
      name: request.name,
      ...(events ? { event: events } : {}),
      request: toPostmanRequest(request)
    })
  }
  for (const folder of settings.folders ?? []) {
    const group = ensureFolder(root, folder.path)
    if (!group) continue
    if (folder.auth) group.auth = toPostmanAuth(folder.auth)
    if (folder.docs?.trim()) group.description = folder.docs
  }
  const collection: Record<string, unknown> = {
    info: {
      name,
      ...(settings.docs?.trim() ? { description: settings.docs } : {}),
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: root,
    ...(settings.auth ? { auth: toPostmanAuth(settings.auth) } : {})
  }
  // Embed the active environment as collection variables so a single exported
  // file carries its {{variables}} too. A file meant for sharing never carries
  // secrets: they keep their name, with an empty value of Postman's secret type.
  if (environment && environment.variables.length) {
    collection.variable = environment.variables.map((v) => ({
      key: v.name,
      value: v.secret ? '' : v.value,
      ...(v.secret ? { type: 'secret' } : {}),
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
