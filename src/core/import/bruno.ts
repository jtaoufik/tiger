/**
 * Import a Bruno collection. Bruno's on-disk format is a close cousin of
 * Tiger's, but uses a line-based block structure (header line ends with `{`,
 * closing `}` sits alone at column 0). We tokenize on that shape rather than by
 * counting braces, because `script:*` / `tests` blocks frequently hold JS whose
 * single-quoted strings, regex literals, or `//` comments throw off any
 * depth-aware scanner.
 *
 * A collection folder holds three kinds of `.bru` files:
 *   - request files, at any depth
 *   - `collection.bru` / `folder.bru`: auth, headers, scripts and docs for the
 *     containing folder (and a display name / seq for folders)
 *   - `environments/<name>.bru`: variable sets
 * `importBrunoCollection` classifies them; the main process only reads disk.
 */

import { dedent, parseKeyValues, type RawBlock } from '../tigerFormat'
import {
  emptyBody,
  isHttpMethod,
  type BodyType,
  type KeyValue,
  type TigerAuth,
  type TigerBody,
  type TigerEnvironment,
  type TigerRequest
} from '../types'
import { applyPathVariables, checkRequest, joinScripts, pathVariableWarning } from './common'
import type { ImportedFolder, ImportedRequest, ImportResult, ImportWarning } from './types'

const BLOCK_HEADER = /^([A-Za-z][\w-]*)(?::([\w:-]+))?\s*\{\s*$/
const BLOCK_END = /^\}\s*$/

/**
 * Split a `.bru` document into its top-level blocks. Bruno does not nest
 * blocks, so a line-based scan is both simpler and more forgiving than the
 * brace counter used for `.tiger` files.
 */
export function tokenizeBrunoBlocks(input: string): RawBlock[] {
  const blocks: RawBlock[] = []
  const lines = input.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  while (i < lines.length) {
    const header = lines[i].match(BLOCK_HEADER)
    if (!header) {
      i++
      continue
    }
    const name = header[1]
    const subtype = header[2]
    let end = -1
    for (let j = i + 1; j < lines.length; j++) {
      if (BLOCK_END.test(lines[j])) {
        end = j
        break
      }
    }
    if (end === -1) break
    blocks.push({ name, subtype, content: lines.slice(i + 1, end).join('\n') })
    i = end + 1
  }
  return blocks
}

function brunoBodyType(subtype: string | undefined): BodyType {
  switch (subtype) {
    case 'json':
      return 'json'
    case 'xml':
      return 'xml'
    case 'text':
    case 'sparql':
      return 'text'
    case 'form-urlencoded':
      return 'form'
    case 'multipart-form':
      return 'multipart'
    default:
      return 'text'
  }
}

/** Lenient key/value parse: lines without a colon are skipped, not fatal. */
function keyValues(content: string): KeyValue[] {
  const lines = content.split('\n').filter((l) => {
    const t = l.trim()
    return !t || t.startsWith('#') || t.startsWith('//') || t.includes(':')
  })
  return parseKeyValues(lines.join('\n'))
}

/** Map an `auth:<mode>` block. Unsupported modes return undefined. */
function brunoAuth(mode: string, content: string): TigerAuth | undefined {
  const kv = Object.fromEntries(keyValues(content).map((k) => [k.name, k.value]))
  switch (mode) {
    case 'none':
      return { type: 'none' }
    case 'bearer':
      return { type: 'bearer', token: kv.token ?? '' }
    case 'basic':
      return { type: 'basic', username: kv.username ?? '', password: kv.password ?? '' }
    case 'apikey':
      return {
        type: 'apikey',
        key: kv.key ?? '',
        value: kv.value ?? '',
        in: /query/i.test(kv.placement ?? '') ? 'query' : 'header'
      }
    case 'oauth2':
      if ((kv.grant_type ?? '') !== 'client_credentials') return undefined
      return {
        type: 'oauth2',
        grantType: 'client_credentials',
        tokenUrl: kv.access_token_url ?? kv.token_url ?? '',
        clientId: kv.client_id ?? '',
        clientSecret: kv.client_secret ?? '',
        scope: kv.scope ?? ''
      }
    default:
      return undefined
  }
}

const AUTH_NAMES: Record<string, string> = {
  awsv4: 'AWS Signature v4',
  digest: 'Digest',
  ntlm: 'NTLM',
  wsse: 'WSSE',
  oauth2: 'OAuth 2.0 (this grant type)'
}

/**
 * Resolve auth for a request or folder: the `auth:` selector in the method
 * (or `auth`) block picks the mode; `inherit` leaves it unset.
 */
function resolveAuth(
  blocks: RawBlock[],
  selector: string | undefined,
  warn: (m: string) => void
): TigerAuth | undefined {
  const authBlocks = blocks.filter((b) => b.name === 'auth' && b.subtype)
  const mode = selector ?? (authBlocks.length === 1 ? authBlocks[0].subtype : undefined)
  if (!mode || mode === 'inherit') return undefined
  if (mode === 'none') return { type: 'none' }
  const block = authBlocks.find((b) => b.subtype === mode)
  const auth = brunoAuth(mode, block?.content ?? '')
  if (!auth) {
    warn(`${AUTH_NAMES[mode] ?? mode} auth is not supported. Auth was set to none; set it up again.`)
    return { type: 'none' }
  }
  return auth
}

/** A Bruno assertion value as a JS literal. */
function literal(raw: string): string {
  const v = raw.trim()
  if (/^-?\d+(\.\d+)?$/.test(v) || v === 'true' || v === 'false' || v === 'null') return v
  if (/^(['"`]).*\1$/.test(v)) return v
  return JSON.stringify(v)
}

const ASSERT_OPS: Record<string, (x: string, v: string) => string> = {
  eq: (x, v) => `expect(${x}).to.eql(${literal(v)})`,
  neq: (x, v) => `expect(${x}).to.not.eql(${literal(v)})`,
  gt: (x, v) => `expect(${x}).to.be.above(${literal(v)})`,
  gte: (x, v) => `expect(${x}).to.be.at.least(${literal(v)})`,
  lt: (x, v) => `expect(${x}).to.be.below(${literal(v)})`,
  lte: (x, v) => `expect(${x}).to.be.at.most(${literal(v)})`,
  contains: (x, v) => `expect(${x}).to.include(${literal(v)})`,
  notContains: (x, v) => `expect(${x}).to.not.include(${literal(v)})`,
  length: (x, v) => `expect(${x}).to.have.lengthOf(${literal(v)})`,
  matches: (x, v) => `expect(${x}).to.match(new RegExp(${JSON.stringify(v.trim())}))`,
  notMatches: (x, v) => `expect(${x}).to.not.match(new RegExp(${JSON.stringify(v.trim())}))`,
  startsWith: (x, v) => `expect(String(${x}).startsWith(${literal(v)})).to.be.true`,
  endsWith: (x, v) => `expect(String(${x}).endsWith(${literal(v)})).to.be.true`,
  isEmpty: (x) => `expect(${x}).to.be.empty`,
  isNotEmpty: (x) => `expect(${x}).to.not.be.empty`,
  isNull: (x) => `expect(${x}).to.be.null`,
  isUndefined: (x) => `expect(${x}).to.be.undefined`,
  isDefined: (x) => `expect(${x}).to.not.be.undefined`,
  isTruthy: (x) => `expect(${x}).to.be.ok`,
  isFalsy: (x) => `expect(${x}).to.not.be.ok`,
  isNumber: (x) => `expect(${x}).to.be.a('number')`,
  isString: (x) => `expect(${x}).to.be.a('string')`,
  isBoolean: (x) => `expect(${x}).to.be.a('boolean')`,
  isArray: (x) => `expect(${x}).to.be.an('array')`,
  isJson: (x) => `expect(${x}).to.be.an('object')`
}

/**
 * Turn Bruno's declarative `assert` block into equivalent tests. Returns the
 * script plus any assertions whose operator has no mapping.
 */
export function assertionsToScript(content: string): { script?: string; skipped: string[] } {
  const lines: string[] = []
  const skipped: string[] = []
  for (const kv of keyValues(content)) {
    if (!kv.enabled) continue
    const [op, ...rest] = kv.value.trim().split(/\s+/)
    const build = ASSERT_OPS[op]
    const target = /^res\b/.test(kv.name) ? kv.name : `res.${kv.name}`
    if (!build) {
      skipped.push(`${kv.name}: ${kv.value}`)
      continue
    }
    const label = JSON.stringify(`${kv.name}: ${kv.value}`)
    lines.push(`test(${label}, function () {\n  ${build(target, rest.join(' '))}\n})`)
  }
  return { script: lines.length ? `// Converted from Bruno assertions\n${lines.join('\n')}` : undefined, skipped }
}

/** Bruno file rows are `@file(path)` (or `@file(a|b)`); Tiger uses `@file:path`. */
function multipartLine(kv: KeyValue): { line: string; file?: string; extra: boolean } {
  const m = kv.value.match(/^@file\((.*)\)$/)
  const prefix = kv.enabled ? '' : '~'
  if (!m) return { line: `${prefix}${kv.name}: ${kv.value}`, extra: false }
  const files = m[1].split('|').map((f) => f.trim()).filter(Boolean)
  return { line: `${prefix}${kv.name}: @file:${files[0] ?? ''}`, file: files[0] ?? '', extra: files.length > 1 }
}

/** Parse a single `.bru` file into a Tiger request. */
export function importBrunoRequest(
  text: string,
  path: string[] = [],
  warnings: ImportWarning[] = []
): ImportedRequest {
  const blocks = tokenizeBrunoBlocks(text)

  const request: TigerRequest = {
    name: '',
    method: 'get',
    url: '',
    headers: [],
    query: [],
    body: emptyBody()
  }
  const warn = (message: string) => warnings.push({ request: request.name || 'Request', path, message })
  let authMode: string | undefined
  let pathVars: KeyValue[] = []
  let pre: string | undefined
  let post: string | undefined
  let tests: string | undefined
  let asserts: string | undefined

  for (const block of blocks) {
    if (block.name === 'meta') {
      for (const kv of keyValues(block.content)) {
        if (kv.name === 'name') request.name = kv.value
        else if (kv.name === 'seq') request.seq = Number(kv.value)
      }
    } else if (isHttpMethod(block.name)) {
      request.method = block.name
      for (const kv of keyValues(block.content)) {
        if (kv.name === 'url') request.url = kv.value
        else if (kv.name === 'auth') authMode = kv.value
      }
    } else if (block.name === 'headers') {
      request.headers = keyValues(block.content)
    } else if (block.name === 'query' || (block.name === 'params' && block.subtype !== 'path')) {
      request.query = keyValues(block.content)
    } else if (block.name === 'params' && block.subtype === 'path') {
      pathVars = keyValues(block.content)
    } else if (block.name === 'body' && block.subtype === 'graphql') {
      // Bruno keeps the GraphQL query in `body:graphql` and (optionally) the
      // variables JSON in a following `body:graphql:vars` block.
      request.body = { type: 'graphql', content: dedent(block.content) }
    } else if (block.name === 'body' && block.subtype === 'graphql:vars') {
      const vars = dedent(block.content)
      // Attach to the query body if we have one, else stash for ordering safety.
      request.body =
        request.body.type === 'graphql'
          ? { ...request.body, variables: vars }
          : { type: 'graphql', content: '', variables: vars }
    } else if (block.name === 'body') {
      const type = brunoBodyType(block.subtype)
      let content: string
      if (type === 'form') {
        content = keyValues(block.content)
          .map((kv) => `${kv.enabled ? '' : '~'}${kv.name}: ${kv.value}`)
          .join('\n')
      } else if (type === 'multipart') {
        const rows = keyValues(block.content).map((kv) => ({ kv, ...multipartLine(kv) }))
        for (const r of rows) {
          if (r.file === undefined) continue
          warn(
            r.file
              ? `Form field "${r.kv.name}" uploads ${r.file}. Check the file exists on this machine.${r.extra ? ' Only the first file was kept.' : ''}`
              : `Form field "${r.kv.name}" is a file upload with no file chosen. Pick the file in the body tab.`
          )
        }
        content = rows.map((r) => r.line).join('\n')
      } else {
        content = dedent(block.content)
      }
      request.body = { type, content } as TigerBody
    } else if (block.name === 'script' && block.subtype === 'pre-request') {
      pre = dedent(block.content)
    } else if (block.name === 'script' && block.subtype === 'post-response') {
      post = dedent(block.content)
    } else if (block.name === 'tests') {
      tests = dedent(block.content)
    } else if (block.name === 'assert') {
      asserts = block.content
    } else if (block.name === 'docs') {
      const docs = dedent(block.content)
      if (docs) request.docs = docs
    } else if (block.name === 'vars' && (block.subtype === 'pre-request' || block.subtype === 'post-response')) {
      const names = keyValues(block.content).map((kv) => kv.name)
      if (names.length) {
        warn(`Request variables (${block.subtype}) are not supported: ${names.join(', ')}. Set them in an environment or a script.`)
      }
    }
  }

  const auth = resolveAuth(blocks, authMode, warn)
  if (auth) request.auth = auth

  if (pathVars.length || /\/:[A-Za-z_]/.test(request.url)) {
    const { url, missing } = applyPathVariables(request.url, pathVars.filter((v) => v.enabled))
    request.url = url
    if (missing.length) {
      warn(pathVariableWarning(missing))
    }
  }

  const converted = asserts ? assertionsToScript(asserts) : { skipped: [] as string[] }
  if (converted.skipped.length) {
    warn(`Assertions not converted to tests: ${converted.skipped.join('; ')}. Add them as tests.`)
  }
  if (pre) request.preScript = pre
  const postAll = joinScripts(post, tests, converted.script)
  if (postAll) request.postScript = postAll

  return { path, request }
}

/**
 * Parse a Bruno `environments/<name>.bru` file. Bruno keeps env values in a
 * `vars { key: value }` block. The sibling `vars:secret [ name, … ]` list
 * declares secrets without values — we don't surface them, since Bruno itself
 * never serializes their values to disk (see `brunoSecretNames`).
 */
export function importBrunoEnvironment(text: string, name: string): TigerEnvironment {
  const blocks = tokenizeBrunoBlocks(text)
  const variables = blocks
    .filter((b) => b.name === 'vars' && !b.subtype)
    .flatMap((b) => keyValues(b.content))
  return { name, variables }
}

/** Names listed in an environment's `vars:secret [ ... ]` (values are never on disk). */
export function brunoSecretNames(text: string): string[] {
  const m = text.match(/^vars:secret\s*\[([\s\S]*?)\]/m)
  if (!m) return []
  return m[1]
    .split(/[,\n]/)
    .map((s) => s.trim().replace(/^~/, ''))
    .filter(Boolean)
}

/** Settings from `collection.bru` / `folder.bru`. */
export interface BrunoFolderSettings {
  name?: string
  seq?: number
  auth?: TigerAuth
  headers: KeyValue[]
  preScript?: string
  postScript?: string
  docs?: string
  vars: KeyValue[]
}

export function importBrunoFolderSettings(text: string, warn: (m: string) => void = () => {}): BrunoFolderSettings {
  const blocks = tokenizeBrunoBlocks(text)
  const out: BrunoFolderSettings = { headers: [], vars: [] }
  let authMode: string | undefined
  let tests: string | undefined
  let post: string | undefined
  for (const block of blocks) {
    if (block.name === 'meta') {
      for (const kv of keyValues(block.content)) {
        if (kv.name === 'name') out.name = kv.value
        else if (kv.name === 'seq') out.seq = Number(kv.value)
      }
    } else if (block.name === 'auth' && !block.subtype) {
      for (const kv of keyValues(block.content)) if (kv.name === 'mode') authMode = kv.value
    } else if (block.name === 'headers') {
      out.headers = keyValues(block.content)
    } else if (block.name === 'script' && block.subtype === 'pre-request') {
      out.preScript = dedent(block.content) || undefined
    } else if (block.name === 'script' && block.subtype === 'post-response') {
      post = dedent(block.content)
    } else if (block.name === 'tests') {
      tests = dedent(block.content)
    } else if (block.name === 'docs') {
      out.docs = dedent(block.content) || undefined
    } else if (block.name === 'vars' && block.subtype === 'pre-request') {
      out.vars = keyValues(block.content)
    }
  }
  const auth = resolveAuth(blocks, authMode, warn)
  if (auth) out.auth = auth
  const postAll = joinScripts(post, tests)
  if (postAll) out.postScript = postAll
  return out
}

/** One `.bru` file (or `bruno.json`) relative to the collection root. */
export interface BrunoFile {
  /** Path segments relative to the root, file name last. */
  segments: string[]
  text: string
}

/**
 * Build a whole collection from its files. Folder names come from
 * `folder.bru` meta when present. Collection and folder headers and scripts
 * are copied into each request below them (Tiger has no folder headers or
 * folder scripts); auth and docs map to Tiger's collection / folder settings.
 */
export function importBrunoCollection(files: BrunoFile[], fallbackName: string): ImportResult {
  const warnings: ImportWarning[] = []
  let name = fallbackName
  const settings = new Map<string, BrunoFolderSettings>() // key: dir segments joined by '/'
  const envs: TigerEnvironment[] = []
  const requestFiles: BrunoFile[] = []

  for (const file of files) {
    const fileName = file.segments[file.segments.length - 1]
    const dir = file.segments.slice(0, -1)
    try {
      if (fileName === 'bruno.json' && dir.length === 0) {
        const parsed = JSON.parse(file.text) as { name?: unknown }
        if (typeof parsed.name === 'string' && parsed.name) name = parsed.name
      } else if (!fileName.endsWith('.bru')) {
        continue
      } else if (dir.includes('environments')) {
        const envName = fileName.replace(/\.bru$/, '')
        envs.push(importBrunoEnvironment(file.text, envName))
        const secrets = brunoSecretNames(file.text)
        if (secrets.length) {
          warnings.push({
            request: envName,
            message: `Secret values are never saved to disk by Bruno: ${secrets.join(', ')}. Add them to the "${envName}" environment.`
          })
        }
      } else if (fileName === 'collection.bru' || fileName === 'folder.bru') {
        const label = dir.length ? `Folder "${dir[dir.length - 1]}"` : 'Collection'
        settings.set(
          dir.join('/'),
          importBrunoFolderSettings(file.text, (message) => warnings.push({ request: label, path: dir.slice(0, -1), message }))
        )
      } else {
        requestFiles.push(file)
      }
    } catch (e) {
      warnings.push({ request: file.segments.join('/'), message: `Could not be read: ${(e as Error).message}` })
    }
  }

  // Display path: each folder segment renamed by its folder.bru meta name.
  const displayPath = (dir: string[]): string[] =>
    dir.map((seg, i) => settings.get(dir.slice(0, i + 1).join('/'))?.name || seg)
  const chainOf = (dir: string[]): BrunoFolderSettings[] => {
    const chain: BrunoFolderSettings[] = []
    for (let i = 0; i <= dir.length; i++) {
      const s = settings.get(dir.slice(0, i).join('/'))
      if (s) chain.push(s)
    }
    return chain
  }

  const requests: ImportedRequest[] = []
  for (const file of requestFiles) {
    const dir = file.segments.slice(0, -1)
    const path = displayPath(dir)
    try {
      const imported = importBrunoRequest(file.text, path, warnings)
      const req = imported.request
      if (!req.name) req.name = file.segments[file.segments.length - 1].replace(/\.bru$/, '')
      const chain = chainOf(dir)
      // Inherited headers go first; the request's own header with the same name wins.
      const own = new Set(req.headers.map((h) => h.name.toLowerCase()))
      const inherited: KeyValue[] = []
      for (const s of chain) {
        for (const h of s.headers) {
          if (own.has(h.name.toLowerCase())) continue
          const at = inherited.findIndex((x) => x.name.toLowerCase() === h.name.toLowerCase())
          if (at !== -1) inherited.splice(at, 1)
          inherited.push(h)
        }
      }
      req.headers = [...inherited, ...req.headers]
      const pre = joinScripts(...chain.map((s) => s.preScript), req.preScript)
      const post = joinScripts(...chain.map((s) => s.postScript), req.postScript)
      if (pre) req.preScript = pre
      if (post) req.postScript = post
      checkRequest(req, path, warnings)
      requests.push(imported)
    } catch (e) {
      warnings.push({ request: file.segments.join('/'), path, message: `Could not be read: ${(e as Error).message}` })
    }
  }

  const folders: ImportedFolder[] = []
  let collectionAuth: TigerAuth | undefined
  let collectionDocs: string | undefined
  let collectionVariables: KeyValue[] = []
  for (const [key, s] of settings) {
    const dir = key ? key.split('/') : []
    const label = dir.length ? `Folder "${s.name || dir[dir.length - 1]}"` : 'The collection'
    const parent = displayPath(dir.slice(0, -1))
    if (dir.length === 0) {
      collectionAuth = s.auth
      collectionDocs = s.docs
    } else if (s.auth || s.docs) {
      folders.push({ path: displayPath(dir), ...(s.auth ? { auth: s.auth } : {}), ...(s.docs ? { docs: s.docs } : {}) })
    }
    const copied = [s.headers.length && 'headers', (s.preScript || s.postScript) && 'scripts'].filter(Boolean)
    if (copied.length) {
      warnings.push({
        request: label,
        path: parent,
        message: `${label} has ${copied.join(' and ')}. Tiger keeps these per request, so they were copied into each request below it. Edit them there.`
      })
    }
    if (s.vars.length) {
      if (dir.length === 0) {
        collectionVariables = s.vars
      } else {
        warnings.push({
          request: label,
          path: parent,
          message: `Folder variables are not supported: ${s.vars.map((v) => v.name).join(', ')}. Add them to an environment.`
        })
      }
    }
  }

  return {
    name,
    source: 'bruno',
    requests,
    ...(envs.length ? { environments: envs } : {}),
    ...(collectionVariables.length ? { collectionVariables } : {}),
    ...(collectionAuth ? { auth: collectionAuth } : {}),
    ...(collectionDocs ? { docs: collectionDocs } : {}),
    ...(folders.length ? { folders } : {}),
    ...(warnings.length ? { warnings } : {})
  }
}
