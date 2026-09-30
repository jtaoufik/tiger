/**
 * Import an OpenAPI 3 / Swagger 2 document. Operations become requests, grouped
 * into folders by their first tag (falling back to the first path segment).
 *
 * Also mapped: local `$ref`s for parameters, request bodies and schemas;
 * path-level parameters; `{id}` path templates (to an example value or
 * `{{id}}`); server URL variables; Swagger 2 `in: body` / `formData`
 * parameters; form, multipart and XML request bodies; and the document's
 * security scheme (bearer, basic, API key, OAuth 2 client credentials) as the
 * collection auth.
 */

import { emptyBody, isHttpMethod, type KeyValue, type TigerAuth, type TigerBody } from '../types'
import { asArray, checkRequest, scalar, str, warning, type Json } from './common'
import type { ImportResult, ImportedRequest, ImportWarning } from './types'

/** Resolve a local `#/a/b` reference (one level at a time, cycle-safe). */
function deref(doc: Json, value: unknown, depth = 0): Json {
  const node = (value ?? {}) as Json
  const ref = node.$ref
  if (typeof ref !== 'string' || !ref.startsWith('#/') || depth > 10) return node
  let cur: unknown = doc
  for (const part of ref.slice(2).split('/')) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~')
    cur = cur && typeof cur === 'object' ? (cur as Json)[key] : undefined
  }
  return deref(doc, cur, depth + 1)
}

function baseUrl(doc: Json): string {
  const servers = doc.servers
  if (Array.isArray(servers) && servers[0] && typeof (servers[0] as Json).url === 'string') {
    const server = servers[0] as Json
    let url = str(server.url)
    const variables = (server.variables ?? {}) as Json
    url = url.replace(/\{([^}]+)\}/g, (_m, name: string) => {
      const def = (variables[name] as Json | undefined)?.default
      return def !== undefined ? scalar(def) : `{{${name}}}`
    })
    // A relative server URL ("/v1") needs a host from the environment.
    return url.startsWith('/') ? `{{baseUrl}}${url.replace(/\/$/, '')}` : url.replace(/\/$/, '')
  }
  // Swagger 2
  const host = str(doc.host)
  if (host) {
    const scheme = Array.isArray(doc.schemes) ? str(doc.schemes[0], 'https') : 'https'
    return `${scheme}://${host}${str(doc.basePath).replace(/\/$/, '')}`
  }
  return '{{baseUrl}}'
}

function exampleOf(doc: Json, p: Json): unknown {
  if (p.example !== undefined) return p.example
  const schema = deref(doc, p.schema)
  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default
  const examples = p.examples as Json | undefined
  if (examples && typeof examples === 'object') {
    const first = Object.values(examples)[0]
    const ex = deref(doc, first)
    if (ex.value !== undefined) return ex.value
  }
  return undefined
}

function paramsOf(doc: Json, params: Json[], where: string): KeyValue[] {
  return params
    .filter((p) => p.in === where)
    .map((p) => ({
      name: str(p.name),
      value: scalar(exampleOf(doc, p)),
      enabled: p.required === true
    }))
}

/** A JSON example built from a schema when the spec gives none. */
function sampleFromSchema(doc: Json, raw: unknown, depth = 0): unknown {
  const schema = deref(doc, raw)
  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default
  if (depth > 4) return null
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0]
  const all = asArray(schema.allOf)
  if (all.length) {
    return Object.assign({}, ...all.map((s) => sampleFromSchema(doc, s, depth + 1) as object))
  }
  const one = asArray(schema.oneOf ?? schema.anyOf)
  if (one.length) return sampleFromSchema(doc, one[0], depth + 1)
  switch (schema.type) {
    case 'object':
    case undefined: {
      const props = (schema.properties ?? {}) as Json
      if (!Object.keys(props).length) return schema.type === 'object' ? {} : null
      return Object.fromEntries(
        Object.entries(props).map(([k, v]) => [k, sampleFromSchema(doc, v, depth + 1)])
      )
    }
    case 'array':
      return [sampleFromSchema(doc, schema.items, depth + 1)]
    case 'integer':
    case 'number':
      return 0
    case 'boolean':
      return false
    case 'string':
      return schema.format === 'date-time' ? new Date(0).toISOString() : ''
    default:
      return null
  }
}

function formFromSchema(doc: Json, schema: unknown, multipart: boolean): string {
  const props = (deref(doc, schema).properties ?? {}) as Json
  return Object.entries(props)
    .map(([k, v]) => {
      const s = deref(doc, v)
      const isFile = multipart && s.type === 'string' && (s.format === 'binary' || s.format === 'base64')
      return isFile ? `${k}: @file:` : `${k}: ${scalar(s.example ?? '')}`
    })
    .join('\n')
}

function bodyOf(doc: Json, op: Json, params: Json[]): TigerBody {
  // Swagger 2: a single `in: body` parameter, or `in: formData` fields.
  const bodyParam = params.find((p) => p.in === 'body')
  if (bodyParam) {
    const ex = exampleOf(doc, bodyParam) ?? sampleFromSchema(doc, bodyParam.schema)
    return { type: 'json', content: ex == null ? '{}' : JSON.stringify(ex, null, 2) }
  }
  const formParams = params.filter((p) => p.in === 'formData')
  if (formParams.length) {
    const multipart = formParams.some((p) => p.type === 'file')
    return {
      type: multipart ? 'multipart' : 'form',
      content: formParams
        .map((p) => (p.type === 'file' ? `${str(p.name)}: @file:` : `${str(p.name)}: ${scalar(p.default ?? '')}`))
        .join('\n')
    }
  }

  const rb = deref(doc, op.requestBody)
  const content = (rb.content ?? {}) as Json
  const types = Object.keys(content)
  const jsonType = types.find((t) => t === 'application/json' || /\+json$/.test(t) || t.endsWith('/json'))
  if (jsonType) {
    const media = (content[jsonType] ?? {}) as Json
    let example = media.example ?? deref(doc, media.schema).example
    if (example === undefined && media.examples && typeof media.examples === 'object') {
      example = deref(doc, Object.values(media.examples as Json)[0]).value
    }
    if (example === undefined && media.schema) example = sampleFromSchema(doc, media.schema)
    return {
      type: 'json',
      content: example !== undefined && example !== null ? JSON.stringify(example, null, 2) : '{}'
    }
  }
  if (content['application/x-www-form-urlencoded']) {
    const media = content['application/x-www-form-urlencoded'] as Json
    return { type: 'form', content: formFromSchema(doc, media.schema, false) }
  }
  if (content['multipart/form-data']) {
    const media = content['multipart/form-data'] as Json
    return { type: 'multipart', content: formFromSchema(doc, media.schema, true) }
  }
  const xmlType = types.find((t) => t.includes('xml'))
  if (xmlType) {
    const media = (content[xmlType] ?? {}) as Json
    return { type: 'xml', content: typeof media.example === 'string' ? media.example : '' }
  }
  const textType = types.find((t) => t.startsWith('text/'))
  if (textType) {
    const media = (content[textType] ?? {}) as Json
    return { type: 'text', content: scalar(media.example ?? '') }
  }
  return emptyBody()
}

/** The first usable security scheme the document (or operation) requires. */
function securityAuth(doc: Json, requirement: unknown, warnings: ImportWarning[], label?: string): TigerAuth | undefined {
  const schemes = {
    ...(((doc.components as Json | undefined)?.securitySchemes ?? {}) as Json),
    ...((doc.securityDefinitions ?? {}) as Json)
  }
  const reqs = asArray(requirement)
  if (reqs.length === 0) return undefined
  for (const r of reqs) {
    const names = Object.keys((r ?? {}) as Json)
    if (names.length === 0) return { type: 'none' } // `{}` = auth optional
    const scheme = deref(doc, schemes[names[0]])
    const type = str(scheme.type)
    const httpScheme = str(scheme.scheme).toLowerCase()
    if ((type === 'http' && httpScheme === 'bearer') || type === 'openIdConnect') {
      return { type: 'bearer', token: '{{token}}' }
    }
    if ((type === 'http' && httpScheme === 'basic') || type === 'basic') {
      return { type: 'basic', username: '{{username}}', password: '{{password}}' }
    }
    if (type === 'apiKey') {
      if (scheme.in === 'cookie') break
      return { type: 'apikey', key: str(scheme.name), value: '{{apiKey}}', in: scheme.in === 'query' ? 'query' : 'header' }
    }
    if (type === 'oauth2') {
      const flows = (scheme.flows ?? {}) as Json
      const cc = (flows.clientCredentials ?? (scheme.flow === 'application' ? scheme : undefined)) as Json | undefined
      if (cc) {
        return {
          type: 'oauth2',
          grantType: 'client_credentials',
          tokenUrl: str(cc.tokenUrl),
          clientId: '{{clientId}}',
          clientSecret: '{{clientSecret}}',
          scope: Object.keys((cc.scopes ?? {}) as Json).join(' ')
        }
      }
      return { type: 'bearer', token: '{{token}}' }
    }
  }
  warnings.push({
    request: label ?? 'Collection auth',
    ...warning('imports.securityUnmapped')
  })
  return undefined
}

export function importOpenApi(raw: unknown): ImportResult {
  const doc = (raw ?? {}) as Json
  const info = (doc.info ?? {}) as Json
  const base = baseUrl(doc)
  const paths = (doc.paths ?? {}) as Json
  const requests: ImportedRequest[] = []
  const warnings: ImportWarning[] = []
  const auth = securityAuth(doc, doc.security, warnings)
  let needsToken = auth && auth.type !== 'none'

  for (const [path, methodsRaw] of Object.entries(paths)) {
    const item = deref(doc, methodsRaw)
    const shared = asArray(item.parameters).map((p) => deref(doc, p))
    for (const [method, opRaw] of Object.entries(item)) {
      if (!isHttpMethod(method)) continue
      const op = (opRaw ?? {}) as Json
      const own = asArray(op.parameters).map((p) => deref(doc, p))
      // Operation parameters override path-level ones with the same name + location.
      const params = [
        ...shared.filter((s) => !own.some((o) => o.name === s.name && o.in === s.in)),
        ...own
      ]
      const tag = Array.isArray(op.tags) ? str(op.tags[0]) : ''
      const folder = tag || path.split('/').filter(Boolean)[0] || ''
      const pathParams = new Map(params.filter((p) => p.in === 'path').map((p) => [str(p.name), p]))
      const url = `${base}${path}`.replace(/(?<!\{)\{([^{}]+)\}(?!\})/g, (_m, name: string) => {
        const p = pathParams.get(name)
        const ex = p ? exampleOf(doc, p) : undefined
        return ex !== undefined ? scalar(ex) : `{{${name}}}`
      })
      const name = str(op.summary) || str(op.operationId) || `${method.toUpperCase()} ${path}`
      const request: ImportedRequest['request'] = {
        name,
        method,
        url,
        query: paramsOf(doc, params, 'query'),
        headers: paramsOf(doc, params, 'header'),
        body: bodyOf(doc, op, params)
      }
      const docs = str(op.description)
      if (docs.trim()) request.docs = docs
      if (op.security !== undefined) {
        const opAuth = securityAuth(doc, op.security, warnings, name)
        if (opAuth) {
          request.auth = opAuth
          if (opAuth.type !== 'none') needsToken = true
        }
      }
      if (params.some((p) => p.in === 'cookie')) {
        warnings.push({
          request: name,
          path: folder ? [folder] : [],
          ...warning('imports.cookieParams', {
            names: params
              .filter((p) => p.in === 'cookie')
              .map((p) => str(p.name))
              .join(', ')
          })
        })
      }
      checkRequest(request, folder ? [folder] : [], warnings)
      requests.push({ path: folder ? [folder] : [], request })
    }
  }

  if (needsToken) {
    warnings.push({
      request: 'Collection auth',
      ...warning('imports.securityPlaceholders', { token: '{{token}}' })
    })
  }
  const docs = str(info.description)
  return {
    name: str(info.title, 'OpenAPI collection'),
    source: 'openapi',
    requests,
    ...(auth && auth.type !== 'none' ? { auth } : {}),
    ...(docs.trim() ? { docs } : {}),
    ...(warnings.length ? { warnings } : {})
  }
}
