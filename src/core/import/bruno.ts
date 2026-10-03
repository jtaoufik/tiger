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

import { keyValueLine } from '../tigerFormat'
import { normalizeText } from '../text'
import { findMissingVars } from '../interpolate'
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
import {
  applyPathVariables,
  checkRequest,
  joinScripts,
  pathVariableWarning,
  warning,
  type WarningText
} from './common'
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
  const lines = normalizeText(input).split('\n')
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
  warn: (w: WarningText) => void
): TigerAuth | undefined {
  const authBlocks = blocks.filter((b) => b.name === 'auth' && b.subtype)
  const mode = selector ?? (authBlocks.length === 1 ? authBlocks[0].subtype : undefined)
  if (!mode || mode === 'inherit') return undefined
  if (mode === 'none') return { type: 'none' }
  const block = authBlocks.find((b) => b.subtype === mode)
  const auth = brunoAuth(mode, block?.content ?? '')
  if (!auth) {
    warn(warning('imports.authUnsupported', { auth: AUTH_NAMES[mode] ?? mode }))
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

/**
 * Bruno file rows are `@file(path)` (or `@file(a|b)`); Tiger uses `@file:path`.
 * `resolveFile` turns a path relative to the collection into one Tiger can open.
 */
function multipartLine(
  kv: KeyValue,
  resolveFile: (path: string) => string
): { line: string; file?: string; extra: boolean } {
  const m = kv.value.match(/^@file\((.*)\)$/)
  const prefix = kv.enabled ? '' : '~'
  if (!m) return { line: keyValueLine(kv), extra: false }
  const files = m[1].split('|').map((f) => f.trim()).filter(Boolean)
  const file = files[0] ? resolveFile(files[0]) : ''
  return { line: `${prefix}${kv.name}: @file:${file}`, file, extra: files.length > 1 }
}

/**
 * The block each `body:` mode of the method block sends. Bruno keeps the
 * content of every mode used so far, so the mode decides, not the last block.
 */
const BODY_BLOCKS = new Map([
  ['json', 'json'],
  ['text', 'text'],
  ['xml', 'xml'],
  ['sparql', 'sparql'],
  ['formUrlEncoded', 'form-urlencoded'],
  ['multipartForm', 'multipart-form'],
  ['graphql', 'graphql'],
  ['file', 'file']
])

/** One `body:*` block as a Tiger body (GraphQL picks up its `body:graphql:vars`). */
function brunoBody(
  block: RawBlock,
  blocks: RawBlock[],
  warn: (w: WarningText) => void,
  resolveFile: (path: string) => string
): TigerBody {
  if (block.subtype === 'graphql') {
    const vars = blocks.find((b) => b.name === 'body' && b.subtype === 'graphql:vars')
    return vars
      ? { type: 'graphql', content: dedent(block.content), variables: dedent(vars.content) }
      : { type: 'graphql', content: dedent(block.content) }
  }
  if (block.subtype === 'file') {
    warn(warning('imports.binaryBody'))
    return emptyBody()
  }
  const type = brunoBodyType(block.subtype)
  if (type === 'form') {
    const content = keyValues(block.content)
      .map((kv) => keyValueLine(kv))
      .join('\n')
    return { type, content }
  }
  if (type === 'multipart') {
    const rows = keyValues(block.content).map((kv) => ({ kv, ...multipartLine(kv, resolveFile) }))
    for (const r of rows) {
      if (r.file === undefined) continue
      warn(
        r.file
          ? warning(r.extra ? 'imports.formFileUploadFirstOnly' : 'imports.formFileUpload', {
              field: r.kv.name,
              files: r.file
            })
          : warning('imports.formFileNone', { field: r.kv.name })
      )
    }
    return { type, content: rows.map((r) => r.line).join('\n') }
  }
  return { type, content: dedent(block.content) } as TigerBody
}

/**
 * Parse a single `.bru` file into a Tiger request. `resolveFile` maps the
 * `@file()` paths of a multipart body (relative to the collection in Bruno).
 */
export function importBrunoRequest(
  text: string,
  path: string[] = [],
  warnings: ImportWarning[] = [],
  resolveFile: (path: string) => string = (p) => p
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
  const warn = (w: WarningText) => warnings.push({ request: request.name || 'Request', path, ...w })
  let authMode: string | undefined
  let bodyMode: string | undefined
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
        else if (kv.name === 'body') bodyMode = kv.value
      }
    } else if (block.name === 'headers') {
      request.headers = keyValues(block.content)
    } else if (block.name === 'query' || (block.name === 'params' && block.subtype !== 'path')) {
      request.query = keyValues(block.content)
    } else if (block.name === 'params' && block.subtype === 'path') {
      pathVars = keyValues(block.content)
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
        warn(warning('imports.requestVariables', { kind: block.subtype ?? '', names: names.join(', ') }))
      }
    }
  }

  // Files written without a mode (older Bruno) send their last body block.
  const bodies = blocks.filter((b) => b.name === 'body' && b.subtype && b.subtype !== 'graphql:vars')
  const wanted = bodyMode === undefined ? undefined : BODY_BLOCKS.get(bodyMode)
  const selected =
    bodyMode === 'none' ? undefined : wanted ? bodies.find((b) => b.subtype === wanted) : bodies[bodies.length - 1]
  if (selected) request.body = brunoBody(selected, blocks, warn, resolveFile)

  // Bruno writes the enabled params both in the url and in params:query. The
  // block also holds the disabled ones, so it is the one kept.
  if (request.query.length) request.url = request.url.replace(/\?[^#]*/, '')

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
    warn(warning('imports.assertionsSkipped', { items: converted.skipped.join('; ') }))
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
/** An environment file (vars blocks, no meta block), as opposed to a request. */
export function isBrunoEnvironment(text: string): boolean {
  return !/^\s*meta\s*\{/m.test(text) && /^\s*vars(:secret)?\s*[[{]/m.test(text)
}

/** KEY=value lines of a .env file: comments, `export` and quotes handled. */
function parseDotenv(text: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^(?:export\s+)?([\w.-]+)\s*=\s*(.*)$/)
    if (!m) continue
    const quoted = m[2].match(/^(['"])([\s\S]*)\1$/)
    out.set(m[1], quoted ? quoted[2] : m[2].replace(/\s+#.*$/, ''))
  }
  return out
}

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

export function importBrunoFolderSettings(text: string, warn: (w: WarningText) => void = () => {}): BrunoFolderSettings {
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
 * `resolveFile` maps `@file()` paths, which Bruno reads relative to the
 * collection folder (only the caller knows where that is on disk).
 */
export function importBrunoCollection(
  files: BrunoFile[],
  fallbackName: string,
  resolveFile?: (path: string) => string
): ImportResult {
  const warnings: ImportWarning[] = []
  let name = fallbackName
  const settings = new Map<string, BrunoFolderSettings>() // key: dir segments joined by '/'
  const envs: TigerEnvironment[] = []
  const requestFiles: BrunoFile[] = []
  let dotenv = new Map<string, string>()
  let hasDotenv = false

  for (const file of files) {
    const fileName = file.segments[file.segments.length - 1]
    const dir = file.segments.slice(0, -1)
    try {
      if (fileName === 'bruno.json' && dir.length === 0) {
        const parsed = JSON.parse(file.text) as { name?: unknown }
        if (typeof parsed.name === 'string' && parsed.name) name = parsed.name
      } else if (fileName === '.env' && dir.length === 0) {
        dotenv = parseDotenv(file.text)
        hasDotenv = true
      } else if (!fileName.endsWith('.bru')) {
        continue
      } else if (dir.length === 1 && dir[0] === 'environments') {
        // Only the root's environments folder: a deeper one holds requests.
        const envName = fileName.replace(/\.bru$/, '')
        envs.push(importBrunoEnvironment(file.text, envName))
        const secrets = brunoSecretNames(file.text)
        if (secrets.length) {
          warnings.push({
            request: envName,
            ...warning('imports.brunoSecrets', { names: secrets.join(', '), env: envName })
          })
        }
      } else if (fileName === 'collection.bru' || fileName === 'folder.bru') {
        const label = dir.length ? `Folder "${dir[dir.length - 1]}"` : 'Collection'
        settings.set(
          dir.join('/'),
          importBrunoFolderSettings(file.text, (w) => warnings.push({ request: label, path: dir.slice(0, -1), ...w }))
        )
      } else {
        requestFiles.push(file)
      }
    } catch (e) {
      warnings.push({
        request: file.segments.join('/'),
        ...warning('imports.couldNotRead', { error: (e as Error).message })
      })
    }
  }

  // Display path: each folder segment renamed by its folder.bru meta name.
  // Two sibling folders shown under the same name stay two folders ("Admin",
  // "Admin 2"), or one's requests would inherit the other's auth.
  const shownAs = new Map<string, string>()
  const takenUnder = new Map<string, Set<string>>()
  const displayName = (dir: string[]): string => {
    const key = dir.join('/')
    const known = shownAs.get(key)
    if (known !== undefined) return known
    const parent = displayPath(dir.slice(0, -1)).join('/')
    const taken = takenUnder.get(parent) ?? new Set<string>()
    takenUnder.set(parent, taken)
    const base = settings.get(key)?.name || dir[dir.length - 1]
    let name = base
    for (let n = 2; taken.has(name); n++) name = `${base} ${n}`
    taken.add(name)
    shownAs.set(key, name)
    return name
  }
  const displayPath = (dir: string[]): string[] => dir.map((_, i) => displayName(dir.slice(0, i + 1)))
  const chainOf = (dir: string[]): BrunoFolderSettings[] => {
    const chain: BrunoFolderSettings[] = []
    for (let i = 0; i <= dir.length; i++) {
      const s = settings.get(dir.slice(0, i).join('/'))
      if (s) chain.push(s)
    }
    return chain
  }

  const placed: Array<{ dir: string[]; imported: ImportedRequest }> = []
  for (const file of requestFiles) {
    const dir = file.segments.slice(0, -1)
    const path = displayPath(dir)
    try {
      const imported = importBrunoRequest(file.text, path, warnings, resolveFile)
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
      placed.push({ dir, imported })
    } catch (e) {
      warnings.push({
        request: file.segments.join('/'),
        path,
        ...warning('imports.couldNotRead', { error: (e as Error).message })
      })
    }
  }

  // Bruno lists folders and requests in their `seq` order, not by file name
  // (and the disk returns files in no particular order).
  const folderSeq = (dir: string[]) => settings.get(dir.join('/'))?.seq ?? Number.POSITIVE_INFINITY
  const requestSeq = (r: ImportedRequest) => r.request.seq ?? Number.POSITIVE_INFINITY
  placed.sort((a, b) => {
    for (let i = 0; i < Math.min(a.dir.length, b.dir.length); i++) {
      if (a.dir[i] === b.dir[i]) continue
      return (
        folderSeq(a.dir.slice(0, i + 1)) - folderSeq(b.dir.slice(0, i + 1)) ||
        a.dir[i].localeCompare(b.dir[i])
      )
    }
    return (
      a.dir.length - b.dir.length ||
      requestSeq(a.imported) - requestSeq(b.imported) ||
      a.imported.request.name.localeCompare(b.imported.request.name)
    )
  })
  const requests: ImportedRequest[] = placed.map((p) => p.imported)

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
        ...warning(
          copied.length > 1
            ? 'imports.folderCopiedBoth'
            : copied[0] === 'headers'
              ? 'imports.folderCopiedHeaders'
              : 'imports.folderCopiedScripts',
          { label }
        )
      })
    }
    if (s.vars.length) {
      if (dir.length === 0) {
        collectionVariables = s.vars
      } else {
        warnings.push({
          request: label,
          path: parent,
          ...warning('imports.folderVariables', { names: s.vars.map((v) => v.name).join(', ') })
        })
      }
    }
  }

  // Bruno reads {{process.env.NAME}} from the collection's .env file. Define
  // exactly the names the collection uses, with their .env values, as secrets.
  const used = new Set<string>()
  const scan = (text: string) => {
    for (const ref of findMissingVars(text, {})) if (ref.startsWith('process.env.')) used.add(ref)
  }
  for (const { request } of requests) scan(JSON.stringify(request))
  for (const v of [...collectionVariables, ...envs.flatMap((e) => e.variables)]) scan(v.value)
  const processEnv = [...used].sort().map((ref) => {
    const key = ref.slice('process.env.'.length)
    return { name: ref, value: dotenv.get(key) ?? '', enabled: true, secret: true }
  })
  const unset = [...used].filter((ref) => !dotenv.has(ref.slice('process.env.'.length)))
  if (unset.length) {
    warnings.push({
      request: hasDotenv ? '.env' : 'process.env',
      ...warning('imports.brunoDotenvMissing', { names: unset.join(', ') })
    })
  }
  collectionVariables = [...collectionVariables, ...processEnv]

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
