/**
 * Import Postman exports: a collection (schema v2.0 / v2.1), an environment
 * (`*.postman_environment.json`) or globals (`*.postman_globals.json`).
 * Postman already uses the `{{variable}}` syntax, so variables carry over
 * untouched.
 *
 * Mapping notes:
 *   - Auth on the collection, a folder or a request maps to Tiger's
 *     collection / folder / request auth, which inherit the same way.
 *     `noauth` becomes an explicit "no auth"; "inherit" leaves it unset.
 *   - Collection and folder scripts run before the request's own in Postman;
 *     Tiger runs scripts per request, so they are copied into each request
 *     (outermost first). The `pm.*` shim in `script.ts` runs them.
 *   - `:id` path variables are resolved into the URL.
 *   - Sibling folders with the same name stay apart ("Admin", "Admin 2"),
 *     each with its own requests and auth.
 *   - Collection variables are returned as `collectionVariables` and folded
 *     into the environments by `layerCollectionVariables`.
 */

import {
  emptyBody,
  isHttpMethod,
  type KeyValue,
  type TigerAuth,
  type TigerBody,
  type TigerEnvironment,
  type TigerRequest
} from '../types'
import {
  applyPathVariables,
  asArray,
  checkRequest,
  joinScripts,
  pathVariableWarning,
  scalar,
  str,
  type Json,
  uniqueSiblingNames,
  warning
} from './common'
import type { ImportedFolder, ImportResult, ImportedRequest, ImportWarning } from './types'

function toKeyValues(raw: unknown): KeyValue[] {
  if (typeof raw === 'string') {
    // v2.0 allows headers as one "Key: Value" string per line.
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.includes(':'))
      .map((line) => {
        const idx = line.indexOf(':')
        const disabled = line.startsWith('//')
        const name = line.slice(disabled ? 2 : 0, idx).trim()
        return { name, value: line.slice(idx + 1).trim(), enabled: !disabled }
      })
  }
  return asArray(raw)
    .map((entry) => {
      const e = (entry ?? {}) as Json
      if (typeof e.key !== 'string') return null
      return { name: e.key, value: scalar(e.value), enabled: e.disabled !== true }
    })
    .filter((kv): kv is KeyValue => kv !== null)
}

/** A query param; `bare` is a key without a value (`?flag`, `value: null`). */
type QueryParam = KeyValue & { bare?: boolean }

function queryFromString(qs: string): QueryParam[] {
  if (!qs) return []
  return qs
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf('=')
      return {
        name: idx === -1 ? pair : pair.slice(0, idx),
        value: idx === -1 ? '' : pair.slice(idx + 1),
        enabled: true,
        ...(idx === -1 ? { bare: true } : {})
      }
    })
}

/**
 * Postman sends a key without a value as `?flag`; a Tiger query row always
 * sends `flag=`, so an enabled one stays in the URL.
 */
function keepBareParams(base: string, params: QueryParam[]): { url: string; query: KeyValue[] } {
  const bare = params.filter((p) => p.bare && p.enabled).map((p) => p.name)
  const query = params
    .filter((p) => !(p.bare && p.enabled))
    .map(({ name, value, enabled }) => ({ name, value, enabled }))
  return { url: bare.length ? `${base}?${bare.join('&')}` : base, query }
}

interface UrlParts {
  url: string
  query: KeyValue[]
  pathVars: Array<{ name: string; value: string }>
}

function splitUrl(url: unknown): UrlParts {
  if (typeof url === 'string') {
    const idx = url.indexOf('?')
    if (idx === -1) return { url, query: [], pathVars: [] }
    return { ...keepBareParams(url.slice(0, idx), queryFromString(url.slice(idx + 1))), pathVars: [] }
  }
  const u = (url ?? {}) as Json
  let raw = str(u.raw)
  if (!raw) {
    // Some exporters omit `raw`; rebuild it from the parts.
    const protocol = str(u.protocol)
    const host = Array.isArray(u.host) ? u.host.join('.') : str(u.host)
    const port = u.port ? `:${scalar(u.port)}` : ''
    const path = Array.isArray(u.path) ? u.path.map(scalar).join('/') : str(u.path)
    raw = `${protocol ? `${protocol}://` : ''}${host}${port}${path ? `/${path}` : ''}`
  }
  const idx = raw.indexOf('?')
  const base = idx === -1 ? raw : raw.slice(0, idx)
  const params: QueryParam[] = Array.isArray(u.query)
    ? u.query
        .map((entry) => (entry ?? {}) as Json)
        .filter((e) => typeof e.key === 'string')
        .map((e) => ({
          name: str(e.key),
          value: scalar(e.value),
          enabled: e.disabled !== true,
          ...(e.value == null ? { bare: true } : {})
        }))
    : queryFromString(idx === -1 ? '' : raw.slice(idx + 1))
  const pathVars = asArray(u.variable)
    .map((v) => (v ?? {}) as Json)
    .filter((v) => typeof v.key === 'string')
    .map((v) => ({ name: str(v.key), value: scalar(v.value) }))
  return { ...keepBareParams(base, params), pathVars }
}

function description(raw: unknown): string | undefined {
  if (typeof raw === 'string') return raw.trim() ? raw : undefined
  const content = str((raw as Json | undefined)?.content)
  return content.trim() ? content : undefined
}

function toBody(raw: unknown, name: string, path: string[], warnings: ImportWarning[]): TigerBody {
  const body = (raw ?? {}) as Json
  const mode = str(body.mode)

  if (mode === 'raw') {
    const language = str(((body.options as Json)?.raw as Json)?.language).toLowerCase()
    const content = str(body.raw)
    if (language === 'json') return { type: 'json', content }
    if (language === 'xml') return { type: 'xml', content }
    return { type: 'text', content }
  }
  if (mode === 'urlencoded') {
    const content = toKeyValues(body.urlencoded)
      .map((kv) => `${kv.enabled ? '' : '~'}${kv.name}: ${kv.value}`)
      .join('\n')
    return { type: 'form', content }
  }
  if (mode === 'formdata') {
    const lines: string[] = []
    for (const entry of asArray(body.formdata)) {
      const e = (entry ?? {}) as Json
      if (typeof e.key !== 'string') continue
      const prefix = e.disabled === true ? '~' : ''
      if (e.type === 'file') {
        const sources = Array.isArray(e.src) ? e.src.map(scalar) : e.src ? [scalar(e.src)] : []
        if (sources.length === 0) {
          warnings.push({
            request: name,
            path,
            ...warning('imports.formFileMissing', { field: e.key })
          })
        } else {
          warnings.push({
            request: name,
            path,
            ...warning(sources.length > 1 ? 'imports.formFileUploadFirstOnly' : 'imports.formFileUpload', {
              field: e.key,
              files: sources.join(', ')
            })
          })
        }
        lines.push(`${prefix}${e.key}: @file:${sources[0] ?? ''}`)
      } else {
        lines.push(`${prefix}${e.key}: ${scalar(e.value)}`)
      }
    }
    return { type: 'multipart', content: lines.join('\n') }
  }
  if (mode === 'graphql') {
    const gql = (body.graphql ?? {}) as Json
    const variables = scalar(gql.variables)
    return {
      type: 'graphql',
      content: str(gql.query),
      ...(variables.trim() ? { variables } : {})
    }
  }
  if (mode === 'file') {
    warnings.push({
      request: name,
      path,
      ...warning('imports.binaryBody')
    })
  }
  return emptyBody()
}

/** Auth fields: v2.1 stores `[{ key, value }]`, v2.0 a plain object. */
function authParams(auth: Json, type: string): Record<string, string> {
  const raw = auth[type]
  if (Array.isArray(raw)) {
    return Object.fromEntries(
      raw.map((p) => (p ?? {}) as Json).map((p) => [str(p.key), scalar(p.value)])
    )
  }
  if (raw && typeof raw === 'object') {
    return Object.fromEntries(Object.entries(raw as Json).map(([k, v]) => [k, scalar(v)]))
  }
  return {}
}

const AUTH_NAMES: Record<string, string> = {
  digest: 'Digest',
  hawk: 'Hawk',
  awsv4: 'AWS Signature',
  ntlm: 'NTLM',
  oauth1: 'OAuth 1.0',
  akamai: 'Akamai EdgeGrid',
  edgegrid: 'Akamai EdgeGrid',
  jwt: 'JWT Bearer',
  asap: 'ASAP'
}

/**
 * Map Postman auth. Returns undefined for "inherit from parent" (or no auth
 * object at all), and an explicit `none` for `noauth` and unsupported types
 * (so an unsupported request never silently sends its parent's credentials).
 */
export function toAuth(
  raw: unknown,
  label: { request?: string; path: string[] },
  warnings: ImportWarning[]
): TigerAuth | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const auth = raw as Json
  const type = str(auth.type)
  const p = authParams(auth, type)
  switch (type) {
    case '':
    case 'inherit':
      return undefined
    case 'noauth':
      return { type: 'none' }
    case 'bearer':
      return { type: 'bearer', token: p.token ?? '' }
    case 'basic':
      return { type: 'basic', username: p.username ?? '', password: p.password ?? '' }
    case 'apikey':
      return {
        type: 'apikey',
        key: p.key ?? '',
        value: p.value ?? '',
        in: p.in === 'query' ? 'query' : 'header'
      }
    case 'oauth2': {
      const grant = p.grant_type || 'authorization_code'
      if (grant === 'client_credentials') {
        if (p.client_authentication === 'body') {
          warnings.push({
            ...label,
            ...warning('imports.oauthBodyCreds')
          })
        }
        return {
          type: 'oauth2',
          grantType: 'client_credentials',
          tokenUrl: p.accessTokenUrl ?? '',
          clientId: p.clientId ?? '',
          clientSecret: p.clientSecret ?? '',
          scope: p.scope ?? ''
        }
      }
      if (p.accessToken) {
        warnings.push({
          ...label,
          ...warning('imports.oauthUnsupportedToken', { grant })
        })
        return { type: 'bearer', token: p.accessToken }
      }
      warnings.push({
        ...label,
        ...warning('imports.oauthUnsupportedNone', { grant })
      })
      return { type: 'none' }
    }
    default:
      warnings.push({
        ...label,
        ...warning('imports.authUnsupported', { auth: AUTH_NAMES[type] ?? type })
      })
      return { type: 'none' }
  }
}

interface Scripts {
  pre?: string
  post?: string
}

function scriptsOf(events: unknown): Scripts {
  const out: Scripts = {}
  for (const entry of asArray(events)) {
    const e = (entry ?? {}) as Json
    if (e.disabled === true) continue
    const script = (e.script ?? {}) as Json
    const exec = script.exec
    const source = (Array.isArray(exec) ? exec.map(scalar).join('\n') : str(exec)).trim()
    if (!source) continue
    if (e.listen === 'prerequest') out.pre = joinScripts(out.pre, source)
    else if (e.listen === 'test') out.post = joinScripts(out.post, source)
  }
  return out
}

function toRequest(
  name: string,
  request: unknown,
  path: string[],
  warnings: ImportWarning[]
): TigerRequest | null {
  const r = (typeof request === 'string' ? { url: request } : (request ?? {})) as Json
  const method = str(r.method, 'GET').toLowerCase()
  if (!isHttpMethod(method)) {
    warnings.push({
      request: name,
      path,
      ...warning('imports.methodUnsupported', { method: str(r.method).toUpperCase() })
    })
    return null
  }

  const parts = splitUrl(r.url)
  const { url, missing } = applyPathVariables(parts.url, parts.pathVars)
  if (missing.length) {
    warnings.push({ request: name, path, ...pathVariableWarning(missing) })
  }
  const req: TigerRequest = {
    name,
    method,
    url,
    headers: toKeyValues(r.header),
    query: parts.query,
    body: toBody(r.body, name, path, warnings)
  }
  const auth = toAuth(r.auth, { request: name, path }, warnings)
  if (auth) req.auth = auth
  const docs = description(r.description)
  if (docs) req.docs = docs
  return req
}

interface WalkState {
  out: ImportedRequest[]
  folders: ImportedFolder[]
  warnings: ImportWarning[]
}

function walk(items: unknown[], path: string[], inherited: Scripts, state: WalkState): void {
  let seq = 1
  const nodes = items.map((item) => (item ?? {}) as Json)
  const folderNodes = nodes.filter((node) => Array.isArray(node.item))
  const names = uniqueSiblingNames(folderNodes.map((node) => str(node.name, 'Untitled')))
  const folderName = new Map(folderNodes.map((node, i) => [node, names[i]]))
  for (const node of nodes) {
    const original = str(node.name, 'Untitled')
    const scripts = scriptsOf(node.event)
    if (Array.isArray(node.item)) {
      const name = folderName.get(node) ?? original
      if (name !== original) {
        state.warnings.push({ request: name, path, ...warning('imports.folderRenamed', { name: original, renamed: name }) })
      }
      const folderPath = [...path, name]
      const auth = toAuth(node.auth, { request: name, path }, state.warnings)
      const docs = description(node.description)
      if (auth || docs) {
        state.folders.push({ path: folderPath, ...(auth ? { auth } : {}), ...(docs ? { docs } : {}) })
      }
      noteCopiedScripts(`Folder "${name}"`, node.item, scripts, path, state.warnings)
      walk(
        node.item,
        folderPath,
        { pre: joinScripts(inherited.pre, scripts.pre), post: joinScripts(inherited.post, scripts.post) },
        state
      )
    } else if (node.request !== undefined) {
      const request = toRequest(original, node.request, path, state.warnings)
      if (request) {
        request.seq = seq++
        const pre = joinScripts(inherited.pre, scripts.pre)
        const post = joinScripts(inherited.post, scripts.post)
        if (pre) request.preScript = pre
        if (post) request.postScript = post
        checkRequest(request, path, state.warnings)
        state.out.push({ path, request })
      }
    }
  }
}

function countRequests(items: unknown[]): number {
  let n = 0
  for (const item of items) {
    const node = (item ?? {}) as Json
    if (Array.isArray(node.item)) n += countRequests(node.item)
    else if (node.request !== undefined) n++
  }
  return n
}

function noteCopiedScripts(
  owner: string,
  items: unknown[],
  scripts: Scripts,
  path: string[],
  warnings: ImportWarning[]
): void {
  if (!scripts.pre && !scripts.post) return
  const kind = scripts.pre && scripts.post ? 'Both' : scripts.pre ? 'Pre' : 'Post'
  const n = countRequests(items)
  warnings.push({
    request: owner,
    path,
    ...warning(`imports.scriptsCopied${kind}`, { owner, count: n })
  })
}

function toEnvironment(name: string, values: unknown): TigerEnvironment {
  return {
    name,
    variables: asArray(values)
      .map((v) => (v ?? {}) as Json)
      .filter((v) => typeof v.key === 'string')
      .map((v) => ({
        name: str(v.key),
        value: scalar(v.value),
        enabled: v.enabled !== false && v.disabled !== true,
        ...(v.type === 'secret' ? { secret: true } : {})
      }))
  }
}

/** True when the JSON is a Postman environment or globals export. */
export function isPostmanEnvironment(raw: unknown): boolean {
  const root = (raw ?? {}) as Json
  return Array.isArray(root.values) && !Array.isArray(root.item)
}

/** True for a Postman v1 collection (`requests`, no `item`), which Tiger asks to export again as v2.1. */
export function isPostmanV1(raw: unknown): boolean {
  const root = (raw ?? {}) as Json
  return !Array.isArray(root.item) && Array.isArray(root.requests)
}

export function importPostman(raw: unknown): ImportResult {
  const root = (raw ?? {}) as Json
  const warnings: ImportWarning[] = []

  if (isPostmanEnvironment(root)) {
    const scope = str(root._postman_variable_scope)
    const globals = scope === 'globals'
    const name = globals ? 'Globals' : str(root.name, 'Postman environment')
    const env = toEnvironment(name, root.values)
    const secrets = env.variables.filter((v) => v.secret && !v.value).map((v) => v.name)
    if (secrets.length) {
      warnings.push({
        request: name,
        ...warning('imports.secretsNotExported', { names: secrets.join(', ') })
      })
    }
    if (globals) return { name, source: 'postman', requests: [], globals: env.variables, warnings }
    return { name, source: 'postman', requests: [], environments: [env], warnings }
  }

  const info = (root.info ?? {}) as Json
  const name = str(info.name, str(root.name, 'Imported collection'))
  if (isPostmanV1(root)) {
    warnings.push({
      ...warning('imports.postmanV1')
    })
    return { name, source: 'postman', requests: [], warnings }
  }

  const requests: ImportedRequest[] = []
  const folders: ImportedFolder[] = []
  const rootScripts = scriptsOf(root.event)
  noteCopiedScripts('The collection', asArray(root.item), rootScripts, [], warnings)
  const auth = toAuth(root.auth, { request: 'Collection auth', path: [] }, warnings)
  walk(asArray(root.item), [], rootScripts, { out: requests, folders, warnings })

  const collectionVariables = toEnvironment(name, root.variable).variables
  const docs = description(info.description)
  return {
    name,
    source: 'postman',
    requests,
    ...(collectionVariables.length ? { collectionVariables } : {}),
    ...(auth ? { auth } : {}),
    ...(docs ? { docs } : {}),
    ...(folders.length ? { folders } : {}),
    ...(warnings.length ? { warnings } : {})
  }
}
