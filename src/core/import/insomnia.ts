/**
 * Import an Insomnia export: the v4 JSON/YAML export (a flat `resources`
 * array where folders reference parents by id) and the newer v5 YAML
 * collection file (`type: collection.insomnia.rest/5.0`, a nested tree). v5 is
 * flattened into v4-shaped resources first so both share one mapping.
 *
 * Mapping notes:
 *   - `{{ _.name }}` becomes `{{name}}`; nested environment JSON is flattened
 *     to dotted names (`{ api: { url } }` gives `api.url`, which Tiger's
 *     `{{api.url}}` reads).
 *   - Each sub environment is merged over the base environment.
 *   - `{% uuid %}` and `{% now %}` tags become Tiger's dynamic variables;
 *     other template tags are kept as text and flagged.
 *   - Folder auth maps to Tiger folder auth; folder scripts (Insomnia 9+) are
 *     copied into each request. `insomnia.*` scripts run through the pm shim.
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
  type WarningText,
  warning
} from './common'
import type { ImportedFolder, ImportResult, ImportedRequest, ImportWarning } from './types'

/** Convert Insomnia template syntax; returns unsupported tag names found. */
export function convertTemplates(text: string, unsupported: Set<string>): string {
  if (!text || (!text.includes('{{') && !text.includes('{%'))) return text
  return text
    .replace(/\{\{\s*_\.([\w.$-]+)\s*\}\}/g, '{{$1}}')
    .replace(/\{\{\s*_\[\s*['"]([^'"]+)['"]\s*\]\s*\}\}/g, '{{$1}}')
    .replace(/\{%\s*(\w+)([^%]*)%\}/g, (match, tag: string, args: string) => {
      if (tag === 'uuid') return '{{$uuid}}'
      if (tag === 'now') {
        if (/unix/.test(args)) return '{{$timestamp}}'
        if (/iso/.test(args) || !args.trim()) return '{{$isoTimestamp}}'
      }
      unsupported.add(tag)
      return match
    })
}

function toKeyValues(raw: unknown, tags: Set<string>): KeyValue[] {
  return asArray(raw)
    .map((entry) => (entry ?? {}) as Json)
    .filter((e) => typeof e.name === 'string')
    .map((e) => ({
      name: convertTemplates(str(e.name), tags),
      value: convertTemplates(scalar(e.value), tags),
      enabled: e.disabled !== true
    }))
}

function formLines(params: unknown, tags: Set<string>, onFile: (name: string, file: string) => void): string {
  return asArray(params)
    .map((p) => (p ?? {}) as Json)
    .filter((p) => typeof p.name === 'string')
    .map((p) => {
      const prefix = p.disabled === true ? '~' : ''
      const name = convertTemplates(str(p.name), tags)
      if (p.type === 'file') {
        const file = str(p.fileName)
        onFile(name, file)
        return `${prefix}${name}: @file:${file}`
      }
      return `${prefix}${name}: ${convertTemplates(scalar(p.value), tags)}`
    })
    .join('\n')
}

function toBody(
  raw: unknown,
  tags: Set<string>,
  warn: (w: WarningText) => void
): TigerBody {
  const body = (raw ?? {}) as Json
  const mime = str(body.mimeType).split(';')[0].trim().toLowerCase()
  const text = convertTemplates(str(body.text), tags)
  if (mime === 'application/graphql') {
    // Insomnia stores GraphQL as a JSON envelope { query, variables } in `text`.
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
  if (mime === 'application/json' || /\+json$/.test(mime)) return { type: 'json', content: text }
  if (mime === 'application/xml' || mime === 'text/xml' || /\+xml$/.test(mime)) {
    return { type: 'xml', content: text }
  }
  if (mime === 'application/x-www-form-urlencoded') {
    return { type: 'form', content: formLines(body.params, tags, () => undefined) }
  }
  if (mime === 'multipart/form-data') {
    const content = formLines(body.params, tags, (name, file) =>
      warn(
        file
          ? warning('imports.formFileUpload', { field: name, files: file })
          : warning('imports.formFileNone', { field: name })
      )
    )
    return { type: 'multipart', content }
  }
  if (mime === 'application/octet-stream' || str(body.fileName)) {
    warn(warning('imports.binaryBody'))
    return emptyBody()
  }
  if (mime.startsWith('text/') || mime.includes('yaml') || (text && !mime)) {
    return { type: 'text', content: text }
  }
  return emptyBody()
}

const AUTH_NAMES: Record<string, string> = {
  digest: 'Digest',
  ntlm: 'NTLM',
  hawk: 'Hawk',
  oauth1: 'OAuth 1.0',
  iam: 'AWS IAM',
  asap: 'ASAP',
  netrc: 'Netrc'
}

function toAuth(raw: unknown, tags: Set<string>, warn: (w: WarningText) => void): TigerAuth | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const a = raw as Json
  const type = str(a.type)
  const t = (v: unknown) => convertTemplates(scalar(v), tags)
  if (!type || type === 'inherit') return undefined
  if (a.disabled === true || type === 'none') return { type: 'none' }
  switch (type) {
    case 'bearer': {
      const prefix = str(a.prefix)
      if (prefix && prefix.toLowerCase() !== 'bearer') {
        warn(warning('imports.bearerPrefix', { prefix }))
      }
      return { type: 'bearer', token: t(a.token) }
    }
    case 'basic':
      return { type: 'basic', username: t(a.username), password: t(a.password) }
    case 'apikey': {
      if (a.addTo === 'cookie') warn(warning('imports.apiKeyCookie'))
      return {
        type: 'apikey',
        key: t(a.key),
        value: t(a.value),
        in: a.addTo === 'queryParams' ? 'query' : 'header'
      }
    }
    case 'oauth2': {
      const grant = str(a.grantType, 'authorization_code')
      if (grant === 'client_credentials') {
        return {
          type: 'oauth2',
          grantType: 'client_credentials',
          tokenUrl: t(a.accessTokenUrl),
          clientId: t(a.clientId),
          clientSecret: t(a.clientSecret),
          scope: t(a.scope)
        }
      }
      warn(warning('imports.oauthUnsupportedNone', { grant }))
      return { type: 'none' }
    }
    default:
      warn(warning('imports.authUnsupported', { auth: AUTH_NAMES[type] ?? type }))
      return { type: 'none' }
  }
}

/** Flatten nested environment JSON into dotted variable names. */
export function flattenEnvData(data: unknown, prefix = '', out: KeyValue[] = []): KeyValue[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return out
  for (const [key, value] of Object.entries(data as Json)) {
    const name = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenEnvData(value, name, out)
    } else {
      out.push({ name, value: scalar(value), enabled: true })
    }
  }
  return out
}

function mergeVars(base: KeyValue[], over: KeyValue[]): KeyValue[] {
  const names = new Set(over.map((v) => v.name))
  return [...base.filter((v) => !names.has(v.name)), ...over]
}

// ---- v5 (Insomnia 11+) -> v4-shaped resources -----------------------------

function isV5(doc: Json): boolean {
  return typeof doc.type === 'string' && doc.type.startsWith('collection.insomnia.rest/')
}

function v5ToResources(doc: Json): Json[] {
  const out: Json[] = [{ _type: 'workspace', _id: 'wrk', name: str(doc.name, 'Insomnia collection') }]
  let n = 0
  const visit = (items: unknown, parentId: string) => {
    for (const item of asArray(items)) {
      const node = (item ?? {}) as Json
      const scripts = (node.scripts ?? {}) as Json
      const id = str((node.meta as Json | undefined)?.id) || `v5_${++n}`
      const common = {
        _id: id,
        parentId,
        name: node.name,
        authentication: node.authentication,
        preRequestScript: scripts.preRequest,
        afterResponseScript: scripts.afterResponse,
        description: (node.meta as Json | undefined)?.description ?? node.description
      }
      if (Array.isArray(node.children)) {
        out.push({ _type: 'request_group', ...common, environment: node.environment })
        visit(node.children, id)
      } else if (node.url !== undefined || node.method !== undefined) {
        out.push({
          _type: 'request',
          ...common,
          method: node.method,
          url: node.url,
          headers: node.headers,
          parameters: node.parameters,
          pathParameters: node.pathParameters,
          body: node.body
        })
      }
    }
  }
  visit(doc.collection, 'wrk')
  const envs = doc.environments as Json | undefined
  if (envs && typeof envs === 'object') {
    out.push({ _type: 'environment', _id: 'env_base', parentId: 'wrk', name: envs.name, data: envs.data })
    for (const sub of asArray(envs.subEnvironments)) {
      const s = (sub ?? {}) as Json
      out.push({ _type: 'environment', _id: `env_${++n}`, parentId: 'env_base', name: s.name, data: s.data })
    }
  }
  return out
}

// ---- mapping ---------------------------------------------------------------

export function importInsomnia(raw: unknown): ImportResult {
  const doc = (raw ?? {}) as Json
  const v5 = isV5(doc)
  const resources = (v5 ? v5ToResources(doc) : asArray(doc.resources)).map((r) => (r ?? {}) as Json)
  const warnings: ImportWarning[] = []

  const workspaces = resources.filter((r) => r._type === 'workspace')
  const multiWorkspace = workspaces.length > 1

  const groups = new Map<string, Json>()
  for (const r of resources) if (r._type === 'request_group') groups.set(str(r._id), r)

  /** Folder chain from the root down, including the workspace name when several. */
  const chainOf = (parentId: string): Json[] => {
    const chain: Json[] = []
    let cursor = parentId
    const seen = new Set<string>()
    while (cursor && groups.has(cursor) && !seen.has(cursor)) {
      seen.add(cursor)
      const group = groups.get(cursor)!
      chain.unshift(group)
      cursor = str(group.parentId)
    }
    return chain
  }
  const workspaceOf = (parentId: string): Json | undefined => {
    const chain = chainOf(parentId)
    const top = chain.length ? str(chain[0].parentId) : parentId
    return workspaces.find((w) => str(w._id) === top)
  }
  const pathOf = (parentId: string): string[] => {
    const names = chainOf(parentId).map((g) => str(g.name, 'Folder'))
    const ws = multiWorkspace ? workspaceOf(parentId) : undefined
    return ws ? [str(ws.name, 'Workspace'), ...names] : names
  }

  // Folders: auth, docs, scripts, and folder-level environment variables.
  const folders: ImportedFolder[] = []
  for (const group of groups.values()) {
    const tags = new Set<string>()
    const path = pathOf(str(group._id))
    const warn = (w: WarningText) => warnings.push({ request: str(group.name), path: path.slice(0, -1), ...w })
    const auth = toAuth(group.authentication, tags, warn)
    const docs = str(group.description).trim() ? str(group.description) : undefined
    if (auth || docs) folders.push({ path, ...(auth ? { auth } : {}), ...(docs ? { docs } : {}) })
    const folderVars = flattenEnvData(group.environment)
    if (folderVars.length) {
      warn(warning('imports.folderVariables', { names: folderVars.map((v) => v.name).join(', ') }))
    }
    if (str(group.preRequestScript).trim() || str(group.afterResponseScript).trim()) {
      warn(warning('imports.folderScripts'))
    }
    if (tags.size) warn(warning('imports.templateTags', { tags: [...tags].join(', ') }))
  }

  const requests: ImportedRequest[] = []
  const skipped: Record<string, number> = {}
  for (const r of resources) {
    if (r._type === 'grpc_request' || r._type === 'websocket_request') {
      const kind = r._type === 'grpc_request' ? 'gRPC' : 'WebSocket'
      skipped[kind] = (skipped[kind] ?? 0) + 1
      continue
    }
    if (r._type !== 'request') continue
    const name = str(r.name, 'Request')
    const parentId = str(r.parentId)
    const path = pathOf(parentId)
    const tags = new Set<string>()
    const warn = (w: WarningText) => warnings.push({ request: name, path, ...w })
    const method = str(r.method, 'GET').toLowerCase()
    if (!isHttpMethod(method)) {
      warn(warning('imports.methodUnsupported', { method: str(r.method).toUpperCase() }))
      continue
    }

    const pathVars = asArray(r.pathParameters)
      .map((p) => (p ?? {}) as Json)
      .map((p) => ({ name: str(p.name), value: convertTemplates(scalar(p.value), tags) }))
    const { url, missing } = applyPathVariables(convertTemplates(str(r.url), tags), pathVars)
    if (missing.length) {
      warn(pathVariableWarning(missing))
    }

    const request: TigerRequest = {
      name,
      method,
      url,
      headers: toKeyValues(r.headers, tags),
      query: toKeyValues(r.parameters, tags),
      body: toBody(r.body, tags, warn)
    }
    const auth = toAuth(r.authentication, tags, warn)
    if (auth) request.auth = auth
    if (str(r.description).trim()) request.docs = str(r.description)

    const chain = chainOf(parentId)
    const pre = joinScripts(...chain.map((g) => str(g.preRequestScript)), str(r.preRequestScript))
    const post = joinScripts(...chain.map((g) => str(g.afterResponseScript)), str(r.afterResponseScript))
    if (pre) request.preScript = pre
    if (post) request.postScript = post
    if (tags.size) warn(warning('imports.templateTagsKept', { tags: [...tags].join(', ') }))
    checkRequest(request, path, warnings)
    requests.push({ path, request })
  }
  for (const [kind, count] of Object.entries(skipped)) {
    warnings.push(warning('imports.skippedRequests', { count, kind }))
  }

  // Environments: base (parent is a workspace) merged under each sub env.
  const environments: TigerEnvironment[] = []
  const envs = resources.filter((r) => r._type === 'environment')
  const envTags = new Set<string>()
  const envVars = (e: Json) =>
    flattenEnvData(e.data).map((v) => ({ ...v, value: convertTemplates(v.value, envTags) }))
  const envIds = new Set(envs.map((e) => str(e._id)))
  for (const base of envs.filter((e) => !envIds.has(str(e.parentId)))) {
    const baseVars = envVars(base)
    const subs = envs.filter((e) => str(e.parentId) === str(base._id))
    const prefix = multiWorkspace ? `${str(workspaceOf(str(base.parentId))?.name, 'Workspace')} / ` : ''
    if (subs.length === 0) {
      if (baseVars.length) environments.push({ name: `${prefix}${str(base.name, 'Base Environment')}`, variables: baseVars })
      continue
    }
    for (const sub of subs) {
      environments.push({
        name: `${prefix}${str(sub.name, 'Environment')}`,
        variables: mergeVars(baseVars, envVars(sub))
      })
    }
  }
  if (envTags.size) {
    warnings.push(warning('imports.envTemplateTags', { tags: [...envTags].join(', ') }))
  }

  const name =
    workspaces.length === 1 ? str(workspaces[0].name, 'Insomnia collection') : 'Insomnia collection'
  // Note: avoid a literal ending in the bare word "import" here — electron-vite's
  // esm-shim plugin pattern-matches it as an import statement and corrupts the chunk.
  return {
    name,
    source: 'insomnia',
    requests,
    ...(environments.length ? { environments } : {}),
    ...(folders.length ? { folders } : {}),
    ...(warnings.length ? { warnings } : {})
  }
}
