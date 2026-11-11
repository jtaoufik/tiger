/**
 * Parser and serializer for the `.tiger` request format — a small block DSL:
 *
 *   meta {
 *     name: Get user
 *     seq: 1
 *   }
 *   get {
 *     url: {{baseUrl}}/users/{{id}}
 *   }
 *   headers {
 *     Accept: application/json
 *     ~X-Debug: 1          # a leading ~ marks the line disabled
 *   }
 *   body:json {
 *     { "hello": "world" }
 *   }
 *
 * Blocks may appear in any order. Serialization is deterministic so re-saving an
 * unchanged request produces no diff.
 */

import {
  emptyBody,
  isHttpMethod,
  type BodyType,
  type HttpMethod,
  type KeyValue,
  type TigerAuth,
  type TigerBody,
  type TigerRequest
} from './types'
import { normalizeText } from './text'

export class TigerParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TigerParseError'
  }
}

export interface RawBlock {
  name: string
  subtype?: string
  content: string
}

/**
 * Split a `.tiger` document into its top-level `name[:subtype] { ... }` blocks.
 * Brace matching is depth-aware so JSON bodies with nested `{}` survive intact.
 */
export function tokenizeBlocks(text: string): RawBlock[] {
  // CRLF from a Git for Windows checkout used to leave "\r" in every body,
  // script and doc: XML bodies went out with a newline before "<?xml", and
  // each save added a blank line.
  const input = normalizeText(text)
  const blocks: RawBlock[] = []
  const n = input.length
  let i = 0

  while (i < n) {
    while (i < n && /\s/.test(input[i])) i++
    if (i >= n) break

    const headerStart = i
    while (i < n && input[i] !== '{') i++
    if (i >= n) {
      const leftover = input.slice(headerStart).trim()
      if (leftover) throw new TigerParseError(`Expected "{" after "${leftover}"`)
      break
    }

    const header = input.slice(headerStart, i).trim()
    // Split only on the FIRST colon so multi-segment subtypes (e.g. Bruno's
    // `body:graphql:vars`) survive as a single `subtype` of `graphql:vars`.
    const colon = header.indexOf(':')
    const name = (colon === -1 ? header : header.slice(0, colon)).trim()
    const subtype = colon === -1 ? undefined : header.slice(colon + 1).trim() || undefined
    if (!name || !/^[A-Za-z][\w-]*$/.test(name)) {
      throw new TigerParseError(`Invalid block name "${header}"`)
    }

    i++ // consume '{'
    const contentStart = i
    // Tiger writes block content indented and closes the block with a "}"
    // alone at the start of a line: end there, so a brace or quote inside a
    // value, a body or a script never matters ("Pa$$w0rd}", a JSON body cut
    // in half, a script with an unbalanced string).
    const lineEnd = indentedBlockEnd(input, contentStart)
    if (lineEnd !== -1) {
      blocks.push({ name, subtype, content: input.slice(contentStart, lineEnd) })
      i = lineEnd + 1
      continue
    }
    // Written by hand with unindented content: count braces instead.
    let depth = 1
    let inString = false // inside a "..." JSON string literal
    while (i < n) {
      const c = input[i]
      if (inString) {
        // Honor backslash escapes so an escaped quote does not end the string.
        if (c === '\\') i++
        else if (c === '"') inString = false
      } else if (c === '"') {
        inString = true
      } else if (c === '{') depth++
      else if (c === '}') {
        depth--
        if (depth === 0) break
      }
      i++
    }
    if (depth !== 0) throw new TigerParseError(`Unbalanced braces in block "${name}"`)

    blocks.push({ name, subtype, content: input.slice(contentStart, i) })
    i++ // consume '}'
  }

  return blocks
}

/**
 * Where a block written the Tiger way ends: the index of a "}" alone at the
 * start of a line, when the header line ends at its "{" and every line in
 * between is blank or indented. -1 otherwise (single-line or hand-written
 * blocks, which the brace counter handles).
 */
function indentedBlockEnd(input: string, start: number): number {
  const firstBreak = input.indexOf('\n', start)
  if (firstBreak === -1 || input.slice(start, firstBreak).trim() !== '') return -1
  let lineStart = firstBreak + 1
  while (lineStart < input.length) {
    const next = input.indexOf('\n', lineStart)
    const line = input.slice(lineStart, next === -1 ? input.length : next)
    if (/^\}[ \t]*$/.test(line)) return lineStart
    if (line.trim() !== '' && !/^[ \t]/.test(line)) return -1
    if (next === -1) return -1
    lineStart = next + 1
  }
  return -1
}

/**
 * A name the plain `name: value` line cannot carry: one that would be read as
 * a comment, a disabled marker or a quoted name, holds a colon or a line
 * break, or has spaces at either end (parsing trims them).
 */
function needsQuotedName(name: string): boolean {
  return /^["#~]|^\/\/|[:\r\n]/.test(name) || name !== name.trim()
}

/**
 * One `name: value` line. A value one line cannot hold (several lines, or
 * spaces at either end, which parsing trims) is written as a JSON string
 * after `name::` instead: a captured, pretty-printed JSON body used to break
 * the whole environment file. A name the line cannot hold (see above) is
 * written as a JSON string too: `"a:b": v`.
 */
export function keyValueLine(kv: { name: string; value: string; enabled?: boolean }): string {
  const name = needsQuotedName(kv.name) ? JSON.stringify(kv.name) : kv.name
  const prefix = `${kv.enabled === false ? '~' : ''}${name}`
  const plain = !/[\r\n]/.test(kv.value) && kv.value === kv.value.trim()
  return plain ? `${prefix}: ${kv.value}` : `${prefix}:: ${JSON.stringify(kv.value)}`
}

/** Index just past the closing quote of the JSON string `line` starts with, or -1. */
function quotedEnd(line: string): number {
  for (let i = 1; i < line.length; i++) {
    if (line[i] === '\\') i++
    else if (line[i] === '"') return i + 1
  }
  return -1
}

/** The value after the colon `rest` starts with: `: text` or `:: "json"`. */
function valueAfterColon(rest: string): string {
  if (rest[1] === ':') {
    const quoted = rest.slice(2).trim()
    if (quoted.startsWith('"')) {
      try {
        const value: unknown = JSON.parse(quoted)
        if (typeof value === 'string') return value
      } catch {
        /* not the quoted form: a value that starts with ":" */
      }
    }
  }
  return rest.slice(1).trim()
}

/**
 * Split a `name: value` (or `name:: "json"`, or `"name": value`) line,
 * already trimmed and without its `~`. Null when there is no colon.
 */
export function splitKeyValue(line: string): { name: string; value: string } | null {
  if (line.startsWith('"')) {
    const end = quotedEnd(line)
    const rest = end === -1 ? '' : line.slice(end).trimStart()
    if (rest.startsWith(':')) {
      try {
        const name: unknown = JSON.parse(line.slice(0, end))
        if (typeof name === 'string') return { name, value: valueAfterColon(rest) }
      } catch {
        /* not a quoted name: a name that starts with a quote, written by hand */
      }
    }
  }
  const idx = line.indexOf(':')
  if (idx === -1) return null
  return { name: line.slice(0, idx).trim(), value: valueAfterColon(line.slice(idx)) }
}

/**
 * Parse `key: value` lines (with optional leading `~` to disable). A line
 * without a colon is an error, or, when `lenient`, a name with an empty
 * value: a form field typed as `flag` must not stop the whole send.
 */
export function parseKeyValues(content: string, lenient = false): KeyValue[] {
  const out: KeyValue[] = []
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) continue

    let enabled = true
    let l = line
    if (l.startsWith('~')) {
      enabled = false
      l = l.slice(1).trim()
    }

    const kv = splitKeyValue(l) ?? (lenient ? { name: l, value: '' } : null)
    if (!kv) {
      throw new TigerParseError(`Expected "key: value" but got "${line}"`)
    }
    out.push({ ...kv, enabled })
  }
  return out
}

/** Remove the common leading indentation and surrounding blank lines. */
export function dedent(text: string): string {
  const lines = text.replace(/^\n+/, '').replace(/\s+$/, '').split('\n')
  const indents = lines
    .filter((l) => l.trim().length > 0)
    .map((l) => l.match(/^[ \t]*/)![0].length)
  const min = indents.length ? Math.min(...indents) : 0
  return lines.map((l) => l.slice(min)).join('\n')
}

export function parseAuth(subtype: string | undefined, content: string): TigerAuth {
  const kv = Object.fromEntries(parseKeyValues(content).map((k) => [k.name, k.value]))
  switch (subtype) {
    case 'bearer':
      return { type: 'bearer', token: kv.token ?? '' }
    case 'basic':
      return { type: 'basic', username: kv.username ?? '', password: kv.password ?? '' }
    case 'apikey':
      return {
        type: 'apikey',
        key: kv.key ?? '',
        value: kv.value ?? '',
        in: kv.in === 'query' ? 'query' : 'header'
      }
    case 'oauth2':
      return {
        type: 'oauth2',
        grantType: 'client_credentials',
        tokenUrl: kv.token_url ?? '',
        clientId: kv.client_id ?? '',
        clientSecret: kv.client_secret ?? '',
        scope: kv.scope ?? ''
      }
    default:
      return { type: 'none' }
  }
}

export function parseRequest(input: string): TigerRequest {
  const blocks = tokenizeBlocks(input)

  let name = ''
  let seq: number | undefined
  let method: HttpMethod | undefined
  let url = ''
  let headers: KeyValue[] = []
  let query: KeyValue[] = []
  let body: TigerBody = emptyBody()
  // Absent block = inherit from the collection; explicit auth:none = no auth.
  let auth: TigerAuth | undefined
  let graphqlVars: string | undefined
  let captures: KeyValue[] | undefined
  let docs: string | undefined
  let preScript: string | undefined
  let postScript: string | undefined

  for (const block of blocks) {
    if (block.name === 'meta') {
      for (const kv of parseKeyValues(block.content)) {
        if (kv.name === 'name') name = kv.value
        else if (kv.name === 'seq' && Number.isFinite(Number(kv.value))) seq = Number(kv.value)
      }
    } else if (isHttpMethod(block.name)) {
      method = block.name
      for (const kv of parseKeyValues(block.content)) {
        if (kv.name === 'url') url = kv.value
      }
    } else if (block.name === 'headers') {
      headers = parseKeyValues(block.content)
    } else if (block.name === 'query') {
      query = parseKeyValues(block.content)
    } else if (block.name === 'body') {
      // A subtype Tiger does not send (Bruno's body:sparql, a typo) is text,
      // not a type the editor cannot show and the sender drops.
      const subtype = block.subtype ?? 'text'
      const type: BodyType = subtype in BODY_TYPES ? (subtype as BodyType) : 'text'
      body = { type, content: dedent(block.content) }
    } else if (block.name === 'graphqlvars') {
      graphqlVars = dedent(block.content)
    } else if (block.name === 'capture') {
      captures = parseKeyValues(block.content)
    } else if (block.name === 'docs') {
      docs = dedent(block.content)
    } else if (block.name === 'script') {
      if (block.subtype === 'pre') preScript = dedent(block.content)
      else if (block.subtype === 'post') postScript = dedent(block.content)
    } else if (block.name === 'auth') {
      auth = parseAuth(block.subtype, block.content)
    }
  }

  if (!method) {
    throw new TigerParseError('Request is missing a method block (get, post, …)')
  }

  if (graphqlVars !== undefined) body = { ...body, variables: graphqlVars }

  const request: TigerRequest = { name, seq, method, url, headers, query, body }
  if (auth) request.auth = auth
  if (captures) request.captures = captures
  if (docs !== undefined) request.docs = docs
  if (preScript !== undefined) request.preScript = preScript
  if (postScript !== undefined) request.postScript = postScript
  return request
}

/** Every body type, as a record so the type system keeps it complete. */
const BODY_TYPES: Record<BodyType, true> = {
  none: true,
  json: true,
  xml: true,
  text: true,
  form: true,
  graphql: true,
  multipart: true
}

/** `  name: value`, the line of a single named field in a block. */
function fieldLine(name: string, value: string): string {
  return `  ${keyValueLine({ name, value })}`
}

function renderKeyValues(blockName: string, items: KeyValue[]): string {
  const lines = items.map((kv) => `  ${keyValueLine(kv)}`)
  return `${blockName} {\n${lines.join('\n')}\n}`
}

/** Render a free-text block (body, graphqlvars, docs) with two-space indent. */
function renderTextBlock(header: string, content: string): string {
  if (!content) return `${header} {\n}`
  const indented = content
    .split('\n')
    .map((l) => (l.length ? `  ${l}` : l))
    .join('\n')
  return `${header} {\n${indented}\n}`
}

export function serializeRequest(req: TigerRequest): string {
  const parts: string[] = []

  // Every single field goes through keyValueLine: a padded or multiline
  // name, URL or password used to come back trimmed, or break the file.
  const metaLines = [fieldLine('name', req.name)]
  if (req.seq !== undefined && Number.isFinite(req.seq)) metaLines.push(`  seq: ${req.seq}`)
  parts.push(`meta {\n${metaLines.join('\n')}\n}`)

  parts.push(`${req.method} {\n${fieldLine('url', req.url)}\n}`)

  if (req.query.length) parts.push(renderKeyValues('query', req.query))
  if (req.headers.length) parts.push(renderKeyValues('headers', req.headers))

  // An empty body keeps its type (body:json {}), so a reload shows JSON, not none.
  if (req.body.type !== 'none') {
    parts.push(renderTextBlock(`body:${req.body.type}`, req.body.content))
  }
  if (req.body.type === 'graphql' && req.body.variables?.trim()) {
    parts.push(renderTextBlock('graphqlvars', req.body.variables))
  }

  if (req.auth) parts.push(renderAuth(req.auth))
  if (req.captures?.length) parts.push(renderKeyValues('capture', req.captures))
  if (req.preScript?.trim()) parts.push(renderTextBlock('script:pre', req.preScript))
  if (req.postScript?.trim()) parts.push(renderTextBlock('script:post', req.postScript))
  if (req.docs?.trim()) parts.push(renderTextBlock('docs', req.docs))

  return `${parts.join('\n\n')}\n`
}

export function renderAuth(auth: TigerAuth): string {
  if (auth.type === 'none') return 'auth:none {\n}'
  const lines: string[] = []
  if (auth.type === 'bearer') {
    lines.push(fieldLine('token', auth.token))
  } else if (auth.type === 'basic') {
    lines.push(fieldLine('username', auth.username), fieldLine('password', auth.password))
  } else if (auth.type === 'apikey') {
    lines.push(fieldLine('key', auth.key), fieldLine('value', auth.value), `  in: ${auth.in}`)
  } else if (auth.type === 'oauth2') {
    lines.push(
      `  grant_type: ${auth.grantType}`,
      fieldLine('token_url', auth.tokenUrl),
      fieldLine('client_id', auth.clientId),
      fieldLine('client_secret', auth.clientSecret)
    )
    if (auth.scope) lines.push(fieldLine('scope', auth.scope))
  }
  return `auth:${auth.type} {\n${lines.join('\n')}\n}`
}
