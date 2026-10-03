/**
 * Import an OpenAPI 3 / Swagger 2 document. Operations become requests, grouped
 * into folders by their first tag (falling back to the first path segment).
 *
 * Also mapped: local `$ref`s for parameters, request bodies and schemas;
 * path-level parameters; `{id}` path templates (to an example value or
 * `{{id}}`); server URL variables; Swagger 2 `in: body` / `formData`
 * parameters; form, multipart and XML request bodies; and the document's
 * security scheme (bearer, basic, API key, OAuth 2 client credentials) as the
 * collection auth. An operation with `security: []` sends no credentials, and
 * API keys required together with the auth are sent as well.
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

/** `{name}` but not `{{name}}`: OpenAPI server variables. */
const SINGLE_BRACE = /(?<!\{)\{([^{}]+)\}(?!\})/g
/** A server URL that starts from the user's own `{{baseUrl}}`. */
const TEMPLATE_BASE = /^\{\{\s*baseUrl\s*\}\}/

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

/** A host that says it is not production: staging2.api.test, api-dev.example.com, localhost:8080. */
function isTestHost(host: string): boolean {
  const name = host.toLowerCase().replace(/:\d+$/, '')
  if (name === '[::1]' || name.startsWith('127.')) return true
  return name
    .split(/[.-]/)
    .some((label) => /^(dev|develop|development|test|testing|stage|staging|stg|sandbox|qa|uat|preprod|local|localhost)\d*$/.test(label))
}

/**
 * The environment name of a server with no description. Tiger never selects
 * an environment named like production by itself, but a bare host does not
 * say which it is, so the first server (usually production) was selected:
 * a host that does not say it is a test one is named "Production (host)".
 */
function serverName(host: string): string {
  return isTestHost(host) ? host : `Production (${host})`
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
  // "{{baseUrl}}/v1" (Tiger's own OpenAPI export) names no host either.
  const absolute = servers.filter((s) => !str(s.url).startsWith('/') && !TEMPLATE_BASE.test(str(s.url)))
  if (absolute.length) {
    const taken = new Set<string>()
    const environments = absolute.map((server, i) => {
      const url = str(server.url)
      const variables: KeyValue[] = [
        { name: 'baseUrl', value: url.replace(SINGLE_BRACE, '{{$1}}').replace(/\/$/, ''), enabled: true }
      ]
      const defaults = new Map<string, string>()
      for (const [name, raw] of Object.entries((server.variables ?? {}) as Json)) {
        const spec = (raw ?? {}) as Json
        const value = scalar(spec.default ?? (Array.isArray(spec.enum) ? spec.enum[0] : ''))
        defaults.set(name, value)
        variables.push({ name, value, enabled: true })
      }
      // The host with its server variables at their defaults: {region}.api.test -> eu.api.test.
      const host = url
        .replace(SINGLE_BRACE, (_m, name: string) => defaults.get(name) ?? `{${name}}`)
        .replace(/^[a-z][a-z\d+.-]*:\/\//i, '')
        .split('/')[0]
      const fallback =
        host && !host.includes('{') ? serverName(host) : absolute.length === 1 ? 'Default' : `Server ${i + 1}`
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
        { name: serverName(host), variables: [{ name: 'baseUrl', value: `${scheme}://${host}${basePath}`, enabled: true }] }
      ]
    }
  }
  // No host anywhere ("/v1" or nothing): requests keep the path, the user supplies the host.
  const relative = servers[0] ? str(servers[0].url).replace(TEMPLATE_BASE, '').replace(/\/$/, '') : basePath
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
  // Swagger 2 keeps a parameter's type and default on the parameter itself.
  if (p.default !== undefined) return p.default
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

/**
 * Headers that the auth and the request body set. OpenAPI 3 says header
 * parameters with these names are ignored; Swagger 2 has no such rule, but
 * an empty one would still replace the token or the body's media type.
 */
const RESERVED_HEADERS = new Set(['accept', 'content-type', 'authorization'])

function paramsOf(doc: Json, params: Json[], where: string): KeyValue[] {
  const reserved = (p: Json) => where === 'header' && RESERVED_HEADERS.has(str(p.name).toLowerCase())
  return params
    .filter((p) => p.in === where && !(reserved(p) && doc.openapi !== undefined))
    .map((p) => {
      const value = scalar(exampleOf(doc, p))
      return { name: str(p.name), value, enabled: p.required === true && !(reserved(p) && !value) }
    })
}

/**
 * Properties one generated example may hold. Big specs link schema to schema
 * (Kubernetes, Stripe, GitHub): expanding every link four levels deep made
 * 150 KB bodies, 180 MB for 2,000 operations. Past the budget a nested
 * object stays empty ({}) to fill in; the body's own fields are always there.
 */
const SAMPLE_PROPERTIES = 300

/** A JSON example built from a schema when the spec gives none. */
function sampleFromSchema(doc: Json, raw: unknown, depth = 0, budget = { left: SAMPLE_PROPERTIES }): unknown {
  const schema = deref(doc, raw)
  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default
  if (depth > 4) return null
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0]
  const all = asArray(schema.allOf)
  if (all.length) {
    return Object.assign({}, ...all.map((s) => sampleFromSchema(doc, s, depth + 1, budget) as object))
  }
  const one = asArray(schema.oneOf ?? schema.anyOf)
  if (one.length) return sampleFromSchema(doc, one[0], depth + 1, budget)
  switch (schema.type) {
    case 'object':
    case undefined: {
      const props = (schema.properties ?? {}) as Json
      const keys = Object.keys(props)
      if (!keys.length) return schema.type === 'object' ? {} : null
      if (depth > 0 && keys.length > budget.left) return {}
      budget.left -= keys.length
      return Object.fromEntries(keys.map((k) => [k, sampleFromSchema(doc, props[k], depth + 1, budget)]))
    }
    case 'array':
      return [sampleFromSchema(doc, schema.items, depth + 1, budget)]
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

/** `application/json; charset=utf-8` -> `application/json`. */
function mediaType(type: string): string {
  return type.split(';')[0].trim().toLowerCase()
}

/** What Tiger sends as Content-Type for a body type when the request sets none. */
const DEFAULT_CONTENT_TYPE: Partial<Record<TigerBody['type'], string>> = {
  json: 'application/json',
  xml: 'text/xml',
  text: 'text/plain'
}

/**
 * The request body, and the Content-Type to send with it when the declared
 * media type is not the one Tiger sends by default for that body type
 * (application/vnd.api+json, application/xml, text/csv...).
 */
function bodyOf(doc: Json, op: Json, params: Json[]): { body: TigerBody; contentType?: string } {
  // Swagger 2: a single `in: body` parameter, or `in: formData` fields.
  const bodyParam = params.find((p) => p.in === 'body')
  if (bodyParam) {
    const ex = exampleOf(doc, bodyParam) ?? sampleFromSchema(doc, bodyParam.schema)
    return { body: { type: 'json', content: ex == null ? '{}' : JSON.stringify(ex, null, 2) } }
  }
  const formParams = params.filter((p) => p.in === 'formData')
  if (formParams.length) {
    const multipart = formParams.some((p) => p.type === 'file')
    return {
      body: {
        type: multipart ? 'multipart' : 'form',
        content: formParams
          .map((p) => (p.type === 'file' ? `${str(p.name)}: @file:` : `${str(p.name)}: ${scalar(p.default ?? '')}`))
          .join('\n')
      }
    }
  }

  const rb = deref(doc, op.requestBody)
  const content = (rb.content ?? {}) as Json
  const types = Object.keys(content)
  const find = (test: (type: string) => boolean) => types.find((t) => test(mediaType(t)))
  const declared = (type: string, body: TigerBody) => {
    const fallback = DEFAULT_CONTENT_TYPE[body.type]
    return fallback && mediaType(type) !== fallback ? { body, contentType: type.trim() } : { body }
  }
  const jsonType = find((t) => t === 'application/json' || /\+json$/.test(t) || t.endsWith('/json'))
  if (jsonType) {
    const media = (content[jsonType] ?? {}) as Json
    let example = media.example ?? deref(doc, media.schema).example
    if (example === undefined && media.examples && typeof media.examples === 'object') {
      example = deref(doc, Object.values(media.examples as Json)[0]).value
    }
    if (example === undefined && media.schema) example = sampleFromSchema(doc, media.schema)
    return declared(jsonType, {
      type: 'json',
      content: example !== undefined && example !== null ? JSON.stringify(example, null, 2) : '{}'
    })
  }
  const formType = find((t) => t === 'application/x-www-form-urlencoded')
  if (formType) {
    const media = (content[formType] ?? {}) as Json
    return { body: { type: 'form', content: formFromSchema(doc, media.schema, false) } }
  }
  const multipartType = find((t) => t === 'multipart/form-data')
  if (multipartType) {
    const media = (content[multipartType] ?? {}) as Json
    return { body: { type: 'multipart', content: formFromSchema(doc, media.schema, true) } }
  }
  const xmlType = find((t) => t.includes('xml'))
  if (xmlType) {
    const media = (content[xmlType] ?? {}) as Json
    return declared(xmlType, { type: 'xml', content: typeof media.example === 'string' ? media.example : '' })
  }
  const textType = find((t) => t.startsWith('text/'))
  if (textType) {
    const media = (content[textType] ?? {}) as Json
    return declared(textType, { type: 'text', content: scalar(media.example ?? '') })
  }
  return { body: emptyBody() }
}

function securitySchemes(doc: Json): Json {
  return {
    ...(((doc.components as Json | undefined)?.securitySchemes ?? {}) as Json),
    ...((doc.securityDefinitions ?? {}) as Json)
  }
}

/**
 * The variable each API key scheme sends: `{{apiKey}}` for a document's only
 * one; with several, each gets its own, named after its scheme, so two keys
 * required together never share a value.
 */
function apiKeyVariables(doc: Json): Map<string, string> {
  const schemes = securitySchemes(doc)
  const names = Object.keys(schemes).filter((name) => str(deref(doc, schemes[name]).type) === 'apiKey')
  if (names.length === 1) return new Map([[names[0], 'apiKey']])
  const taken = new Set(['token', 'username', 'password', 'clientId', 'clientSecret', 'baseUrl'])
  return new Map(
    names.map((name) => {
      const base = name.replace(/[^\w.-]+/g, '_') || 'apiKey'
      let variable = base
      for (let n = 2; taken.has(variable); n++) variable = `${base}_${n}`
      taken.add(variable)
      return [name, variable]
    })
  )
}

/** One security scheme as Tiger auth, or undefined when Tiger cannot send it (a cookie API key...). */
function schemeAuth(scheme: Json, apiKeyVariable: string): TigerAuth | undefined {
  const type = str(scheme.type)
  const httpScheme = str(scheme.scheme).toLowerCase()
  if ((type === 'http' && httpScheme === 'bearer') || type === 'openIdConnect') {
    return { type: 'bearer', token: '{{token}}' }
  }
  if ((type === 'http' && httpScheme === 'basic') || type === 'basic') {
    return { type: 'basic', username: '{{username}}', password: '{{password}}' }
  }
  if (type === 'apiKey') {
    if (scheme.in === 'cookie') return undefined
    return {
      type: 'apikey',
      key: str(scheme.name),
      value: `{{${apiKeyVariable}}}`,
      in: scheme.in === 'query' ? 'query' : 'header'
    }
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
  return undefined
}

type ApiKeyAuth = Extract<TigerAuth, { type: 'apikey' }>

interface Security {
  auth?: TigerAuth
  /**
   * API keys required together with `auth`. Tiger auth holds one scheme, so
   * these go on the request as headers or query parameters.
   */
  alsoSent: ApiKeyAuth[]
}

/**
 * The first usable requirement of the document (or an operation). Its
 * schemes are all required: one becomes the auth (one that uses the
 * Authorization header first), the other API keys are sent with it, and a
 * scheme Tiger cannot add is reported.
 */
function securityOf(
  doc: Json,
  requirement: unknown,
  apiKeys: Map<string, string>,
  warnings: ImportWarning[],
  label = 'Collection auth'
): Security {
  const schemes = securitySchemes(doc)
  for (const r of asArray(requirement)) {
    const names = Object.keys((r ?? {}) as Json)
    if (names.length === 0) return { auth: { type: 'none' }, alsoSent: [] } // `{}` = auth optional
    const mapped = names.map((name) => ({
      name,
      auth: schemeAuth(deref(doc, schemes[name]), apiKeys.get(name) ?? 'apiKey')
    }))
    const usable = mapped.filter((m) => m.auth)
    if (usable.length === 0) {
      if (deref(doc, schemes[names[0]]).in === 'cookie') break
      continue
    }
    const primary = usable.find((m) => m.auth!.type !== 'apikey') ?? usable[0]
    const alsoSent: ApiKeyAuth[] = []
    const missing: string[] = []
    for (const m of mapped) {
      if (m === primary) continue
      if (m.auth?.type === 'apikey') alsoSent.push(m.auth)
      else missing.push(m.name)
    }
    if (missing.length) {
      warnings.push({ request: label, ...warning('imports.securityPartial', { schemes: missing.join(', ') }) })
    }
    return { auth: primary.auth, alsoSent }
  }
  if (asArray(requirement).length) warnings.push({ request: label, ...warning('imports.securityUnmapped') })
  return { alsoSent: [] }
}

/**
 * Credentials come from the security scheme: a parameter with the same name
 * stays, disabled, so an empty one never replaces them, and each API key
 * required alongside the auth is sent with its own variable.
 */
function applySecurity(request: TigerRequest, auth: TigerAuth | undefined, alsoSent: ApiKeyAuth[]): void {
  const rows = (where: 'header' | 'query') => (where === 'header' ? request.headers : request.query)
  const same = (where: 'header' | 'query', a: string, b: string) =>
    where === 'header' ? a.toLowerCase() === b.toLowerCase() : a === b
  const sets: Array<{ in: 'header' | 'query'; name: string }> = alsoSent.map((k) => ({ in: k.in, name: k.key }))
  if (auth?.type === 'apikey') sets.push({ in: auth.in, name: auth.key })
  else if (auth && auth.type !== 'none') sets.push({ in: 'header', name: 'Authorization' })
  for (const target of sets) {
    for (const row of rows(target.in)) if (same(target.in, row.name, target.name)) row.enabled = false
  }
  for (const key of alsoSent) rows(key.in).push({ name: key.key, value: key.value, enabled: true })
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
  const apiKeys = apiKeyVariables(doc)
  const collection = securityOf(doc, doc.security, apiKeys, warnings)
  const auth = collection.auth
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
      const { body, contentType } = bodyOf(doc, op, params)
      const request: ImportedRequest['request'] = {
        name,
        method,
        url,
        query: paramsOf(doc, params, 'query'),
        headers: paramsOf(doc, params, 'header'),
        body
      }
      if (contentType && !request.headers.some((h) => h.enabled && h.name.toLowerCase() === 'content-type')) {
        request.headers.push({ name: 'Content-Type', value: contentType, enabled: true })
      }
      const docs = str(op.description)
      if (docs.trim()) request.docs = docs
      // An operation's own security replaces the document's; `security: []`
      // marks it public, so it must not inherit the collection's credentials.
      let security = collection
      if (Array.isArray(op.security) && op.security.length === 0) {
        security = { auth: { type: 'none' }, alsoSent: [] }
        request.auth = { type: 'none' }
      } else if (op.security !== undefined) {
        const own = securityOf(doc, op.security, apiKeys, warnings, name)
        if (own.auth) {
          security = own
          request.auth = own.auth
          if (own.auth.type !== 'none') needsToken = true
        }
      }
      applySecurity(request, security.auth, security.alsoSent)
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
    // Also what the environment's own values use, such as https://{{host}}/v1.
    const needed = new Set([...used, ...env.variables.flatMap((v) => findMissingVars(v.value, {}))])
    for (const name of needed) {
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
