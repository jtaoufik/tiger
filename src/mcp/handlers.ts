/**
 * MCP tool handlers. These are pure with respect to IO: they take an injected
 * collection store and HTTP runner, so they can be unit-tested without a real
 * filesystem or network. `server.ts` wires them to the MCP SDK over stdio.
 */

import { resolveAuth } from '../core/collectionSettings'
import { envToVars, type VarMap } from '../core/interpolate'
import { buildRequest, type BuiltRequest } from '../core/request'
import { formatResponse, type RawResponse } from '../core/response'
import { parseRequest } from '../core/tigerFormat'
import type { TigerAuth, TigerEnvironment, TigerRequest } from '../core/types'

export interface RequestRef {
  name: string
  path: string
}

export interface EnvironmentRef {
  name: string
  path: string
}

/** Abstraction over a collection on disk so handlers stay testable. */
export interface CollectionStore {
  listRequests(): Promise<RequestRef[]>
  readRequest(path: string): Promise<string>
  /** The collection's default auth (from `collection.tiger`), if any. */
  readCollectionAuth(): Promise<TigerAuth | undefined>
  listEnvironments(): Promise<EnvironmentRef[]>
  readEnvironment(name: string): Promise<TigerEnvironment | null>
}

export interface HttpRunner {
  send(built: BuiltRequest, timeoutMs?: number): Promise<RawResponse>
  /** Client-credentials token exchange for oauth2 auth. */
  oauthToken(auth: Extract<TigerAuth, { type: 'oauth2' }>, vars: VarMap): Promise<string>
}

export interface ToolResult {
  [key: string]: unknown
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

function ok(payload: unknown): ToolResult {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
  return { content: [{ type: 'text', text }] }
}

function fail(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

const REDACTED = '***'

/** A value that points at an environment variable is safe to show verbatim. */
function isVarRef(value: string): boolean {
  return /\{\{\s*[\w.$-]+\s*\}\}/.test(value)
}

/** One secret field: keep `{{variable}}` references, otherwise mask it. */
function redactSecret(value: string): string {
  return isVarRef(value) ? value : REDACTED
}

/**
 * Redact literal secrets in a request's auth before returning it to a client.
 * Variable references are preserved so the caller can still see what is wired.
 */
function redactAuth(auth: TigerAuth | undefined): TigerAuth | undefined {
  if (!auth) return auth
  switch (auth.type) {
    case 'bearer':
      return { ...auth, token: redactSecret(auth.token) }
    case 'basic':
      return { ...auth, password: redactSecret(auth.password) }
    case 'apikey':
      return { ...auth, value: redactSecret(auth.value) }
    case 'oauth2':
      return { ...auth, clientSecret: redactSecret(auth.clientSecret) }
    default:
      return auth
  }
}

/**
 * Strip filesystem paths out of an error message so we never leak where the
 * collection lives. Removes the collection root prefix and any absolute-looking
 * path (POSIX or Windows), keeping just the basename.
 */
function sanitizeError(message: string, root?: string): string {
  let out = message
  if (root) {
    // Escape regex metacharacters in the root before building the pattern.
    const escaped = root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`${escaped}[/\\\\]?`, 'g'), '')
  }
  // Collapse any remaining absolute path (e.g. '/Users/foo/secret.tiger') to
  // its last path segment.
  out = out.replace(/(?:\/|[A-Za-z]:\\)[^\s'"]*[/\\]([^\s'"/\\]+)/g, '$1')
  // A bare leading-slash path with a single segment (e.g. '/secret.tiger').
  out = out.replace(/(^|[\s'"])\/([^\s'"/\\]+)/g, '$1$2')
  return out
}

export async function handleListRequests(store: CollectionStore): Promise<ToolResult> {
  return ok(await store.listRequests())
}

export async function handleListEnvironments(store: CollectionStore): Promise<ToolResult> {
  return ok(await store.listEnvironments())
}

export async function handleGetRequest(
  store: CollectionStore,
  path: string
): Promise<ToolResult> {
  try {
    const parsed = parseRequest(await store.readRequest(path))
    return ok({ ...parsed, auth: redactAuth(parsed.auth) })
  } catch (e) {
    return fail(sanitizeError(`Could not read request "${path}": ${(e as Error).message}`))
  }
}

export interface RunArgs {
  path: string
  environment?: string
  timeoutMs?: number
}

export async function handleRunRequest(
  store: CollectionStore,
  runner: HttpRunner,
  args: RunArgs
): Promise<ToolResult> {
  let built: BuiltRequest
  try {
    const request = parseRequest(await store.readRequest(args.path))
    const env = args.environment ? await store.readEnvironment(args.environment) : null
    const vars = envToVars(env)

    // Inherit the collection's default auth unless the request opts out.
    const collectionAuth = await store.readCollectionAuth()
    let effective: TigerRequest = { ...request, auth: resolveAuth(request, collectionAuth) }

    // OAuth2 client-credentials must be resolved to a bearer token before the
    // request is built, otherwise no Authorization header is ever sent.
    if (effective.auth?.type === 'oauth2') {
      const token = await runner.oauthToken(effective.auth, vars)
      effective = { ...effective, auth: { type: 'bearer', token } }
    }

    built = buildRequest(effective, vars)
  } catch (e) {
    return fail(sanitizeError(`Could not prepare request "${args.path}": ${(e as Error).message}`))
  }

  try {
    const formatted = formatResponse(await runner.send(built, args.timeoutMs))
    return ok({
      request: { method: built.method, url: built.url },
      environment: args.environment ?? null,
      status: formatted.status,
      statusText: formatted.statusText,
      ok: formatted.ok,
      timeMs: formatted.timeMs,
      size: formatted.sizeLabel,
      headers: redactAuthHeaders(formatted.headers),
      body: formatted.body
    })
  } catch (e) {
    return fail(sanitizeError(`Request to ${built.url} failed: ${(e as Error).message}`))
  }
}

/** Mask the value of any echoed Authorization header in the response. */
function redactAuthHeaders(
  headers: Array<{ name: string; value: string }>
): Array<{ name: string; value: string }> {
  return headers.map((h) =>
    h.name.toLowerCase() === 'authorization' ? { ...h, value: REDACTED } : h
  )
}
