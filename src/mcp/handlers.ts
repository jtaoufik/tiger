/**
 * MCP tool handlers. These are pure with respect to IO: they take an injected
 * collection store and HTTP runner, so they can be unit-tested without a real
 * filesystem or network. `server.ts` wires them to the MCP SDK over stdio.
 */

import { envToVars } from '../core/interpolate'
import { buildRequest, type BuiltRequest } from '../core/request'
import { formatResponse, type RawResponse } from '../core/response'
import { parseRequest } from '../core/tigerFormat'
import type { TigerEnvironment } from '../core/types'

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
  listEnvironments(): Promise<EnvironmentRef[]>
  readEnvironment(name: string): Promise<TigerEnvironment | null>
}

export interface HttpRunner {
  send(built: BuiltRequest, timeoutMs?: number): Promise<RawResponse>
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
    return ok(parsed)
  } catch (e) {
    return fail(`Could not read request "${path}": ${(e as Error).message}`)
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
  let env: TigerEnvironment | null = null
  let built: BuiltRequest
  try {
    const request = parseRequest(await store.readRequest(args.path))
    env = args.environment ? await store.readEnvironment(args.environment) : null
    built = buildRequest(request, envToVars(env))
  } catch (e) {
    return fail(`Could not prepare request "${args.path}": ${(e as Error).message}`)
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
      headers: formatted.headers,
      body: formatted.body
    })
  } catch (e) {
    return fail(`Request to ${built.url} failed: ${(e as Error).message}`)
  }
}
