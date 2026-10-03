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

import { findMissingVars } from '../interpolate'
import {
  emptyBody,
  isHttpMethod,
  type KeyValue,
  type TigerAuth,
  type TigerBody,
  type TigerEnvironment,
  type TigerRequest
} from '../types'
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

interface Servers {
  /** What every request URL starts with: `{{baseUrl}}`, plus a relative server's path. */
  prefix: string
  environments: TigerEnvironment[]
  /** The environment whose `baseUrl` the user must fill in: no server names a host. */
  needsHost?: string
}

function uniqueName(name: string, taken: Set<string>): string {
  let out = name
  for (let n = 2; taken.has(out); n++) out = `${name} ${n}`
  taken.add(out)
  return out
}

/**
 * Servers become environments, so requests stay on `{{baseUrl}}` and choosing
 * an environment chooses the server. Server variables stay switchable:
 * `https://{env}.api.test` becomes `https://{{env}}.api.test` with `env` set to
 * its default in the same environment.
 */
function serversOf(doc: Json): Servers {
  const servers = asArray(doc.servers).filter(
    (s): s is Json => !!s && typeof s === 'object' && typeof (s as Json).url === 'string'
  )
  const absolute = servers.filter((s) => !str(s.url).startsWith('/'))
  if (absolute.length) {
    const taken = new Set<string>()
    const environments = absolute.map((server, i) => {
      const url = str(server.url)
      const host = url.replace(/^[a-z][a-z\d+.-]*:\/\//i, '').split('/')[0]
      const fallback =
        host && !host.includes('{') ? host : absolute.length === 1 ? 'Default' : `Server ${i + 1}`
      const variables: KeyValue[] = [
        { name: 'baseUrl', value: url.replace(/\{([^{}]+)\}/g, '{{$1}}').replace(/\/$/, ''), enabled: true }
      ]
      for (const [name, raw] of Object.entries((server.variables ?? {}) as Json)) {
        const spec = (raw ?? {}) as Json
        const value = spec.default ?? (Array.isArray(spec.enum) ? spec.enum[0] : '')
        variables.push({ name, value: scalar(value), enabled: true })
      }
      return { name: uniqueName(str(server.description).trim() || fallback, taken), variables }
    })
    return { prefix: '{{baseUrl}}', environments }
  }
  // Swagger 2
  const host = str(doc.host)
  const basePath = str(doc.basePath).replace(/\/$/, '')
  if (host) {
    const scheme = Array.isArray(doc.schemes) ? str(doc.schemes[0], 'https') : 'https'
    return {
      prefix: '{{baseUrl}}',
      environments: [
        { name: host, variables: [{ name: 'baseUrl', value: `${scheme}://${host}${basePath}`, enabled: true }] }
      ]
    }
  }
  // No host anywhere ("/v1" or nothing): requests keep the path, the user supplies the host.
  const relative = servers[0] ? str(servers[0].url).replace(/\/$/, '') : basePath
  return {
    prefix: `{{baseUrl}}${relative}`,
    environments: [{ name: 'Default', variables: [{ name: 'baseUrl', value: '', enabled: true }] }],
    needsHost: 'Default'
  }
}

/** `{{name}}` tokens a request sends: URL, query, headers, body and auth. */
function placeholdersOf(request: TigerRequest, collectionAuth?: TigerAuth): string[] {
  const texts = [request.url, request.body.content]
  for (const kv of [...request.query, ...request.headers]) texts.push(kv.name, kv.value)
  for (const auth of [request.auth, collectionAuth]) {
    for (const v of Object.values(auth ?? {})) if (typeof v === 'string') texts.push(v)
  }
  return texts.flatMap((t) => findMissingVars(t, {}))
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
  const { prefix, environments, needsHost } = serversOf(doc)
  /** Path parameters left as `{{name}}`: each request fills its own, so no environment defines them. */
  const pathPlaceholders = new Set<string>()
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
      const url = `${prefix}${path}`.replace(/(?<!\{)\{([^{}]+)\}(?!\})/g, (_m, name: string) => {
        const p = pathParams.get(name)
        const ex = p ? exampleOf(doc, p) : undefined
        if (ex !== undefined) return scalar(ex)
        pathPlaceholders.add(name)
        return `{{${name}}}`
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
  if (needsHost) {
    warnings.push({ request: needsHost, ...warning('imports.baseUrlUnknown', { name: needsHost }) })
  }
  // Define every variable the requests now use (auth placeholders such as
  // {{token}}, server variables the document did not declare), so a send never
  // goes out with a literal {{name}} in it.
  const used = new Set(requests.flatMap(({ request }) => placeholdersOf(request, auth)))
  for (const env of environments) {
    const defined = new Set(env.variables.map((v) => v.name))
    for (const name of used) {
      if (!defined.has(name) && !pathPlaceholders.has(name)) {
        env.variables.push({ name, value: '', enabled: true })
      }
    }
  }
  const docs = str(info.description)
  return {
    name: str(info.title, 'OpenAPI collection'),
    source: 'openapi',
    requests,
    environments,
    ...(auth && auth.type !== 'none' ? { auth } : {}),
    ...(docs.trim() ? { docs } : {}),
    ...(warnings.length ? { warnings } : {})
  }
}
