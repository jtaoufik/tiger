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
export function tokenizeBlocks(input: string): RawBlock[] {
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
    const [name, subtype] = header.split(':').map((s) => s.trim())
    if (!name || !/^[A-Za-z][\w-]*$/.test(name)) {
      throw new TigerParseError(`Invalid block name "${header}"`)
    }

    i++ // consume '{'
    const contentStart = i
    let depth = 1
    while (i < n) {
      const c = input[i]
      if (c === '{') depth++
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

/** Parse `key: value` lines (with optional leading `~` to disable). */
export function parseKeyValues(content: string): KeyValue[] {
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

    const idx = l.indexOf(':')
    if (idx === -1) {
      throw new TigerParseError(`Expected "key: value" but got "${line}"`)
    }
    out.push({
      name: l.slice(0, idx).trim(),
      value: l.slice(idx + 1).trim(),
      enabled
    })
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

  for (const block of blocks) {
    if (block.name === 'meta') {
      for (const kv of parseKeyValues(block.content)) {
        if (kv.name === 'name') name = kv.value
        else if (kv.name === 'seq') seq = Number(kv.value)
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
      const type = (block.subtype ?? 'text') as BodyType
      body = { type, content: dedent(block.content) }
    } else if (block.name === 'auth') {
      auth = parseAuth(block.subtype, block.content)
    }
  }

  if (!method) {
    throw new TigerParseError('Request is missing a method block (get, post, …)')
  }

  const request: TigerRequest = { name, seq, method, url, headers, query, body }
  if (auth) request.auth = auth
  return request
}

function renderKeyValues(blockName: string, items: KeyValue[]): string {
  const lines = items.map(
    (kv) => `  ${kv.enabled === false ? '~' : ''}${kv.name}: ${kv.value}`
  )
  return `${blockName} {\n${lines.join('\n')}\n}`
}

export function serializeRequest(req: TigerRequest): string {
  const parts: string[] = []

  const metaLines = [`  name: ${req.name}`]
  if (req.seq !== undefined) metaLines.push(`  seq: ${req.seq}`)
  parts.push(`meta {\n${metaLines.join('\n')}\n}`)

  parts.push(`${req.method} {\n  url: ${req.url}\n}`)

  if (req.query.length) parts.push(renderKeyValues('query', req.query))
  if (req.headers.length) parts.push(renderKeyValues('headers', req.headers))

  if (req.body.type !== 'none' && req.body.content.trim()) {
    const indented = req.body.content
      .split('\n')
      .map((l) => (l.length ? `  ${l}` : l))
      .join('\n')
    parts.push(`body:${req.body.type} {\n${indented}\n}`)
  }

  if (req.auth) parts.push(renderAuth(req.auth))

  return `${parts.join('\n\n')}\n`
}

export function renderAuth(auth: TigerAuth): string {
  if (auth.type === 'none') return 'auth:none {\n}'
  const lines: string[] = []
  if (auth.type === 'bearer') {
    lines.push(`  token: ${auth.token}`)
  } else if (auth.type === 'basic') {
    lines.push(`  username: ${auth.username}`, `  password: ${auth.password}`)
  } else if (auth.type === 'apikey') {
    lines.push(`  key: ${auth.key}`, `  value: ${auth.value}`, `  in: ${auth.in}`)
  } else if (auth.type === 'oauth2') {
    lines.push(
      `  grant_type: ${auth.grantType}`,
      `  token_url: ${auth.tokenUrl}`,
      `  client_id: ${auth.clientId}`,
      `  client_secret: ${auth.clientSecret}`
    )
    if (auth.scope) lines.push(`  scope: ${auth.scope}`)
  }
  return `auth:${auth.type} {\n${lines.join('\n')}\n}`
}
