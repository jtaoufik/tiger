/**
 * Pre-request and post-response scripting. Scripts are small JavaScript snippets
 * run in a constrained Function sandbox with a `tiger` API object — no access to
 * the DOM, Node, network or globals beyond what we inject. They can read/modify
 * variables, read the request, inspect the response (post only) and assert.
 *
 * Scripts imported from other tools keep working through compatibility shims
 * that map onto the same variable map, test list and log:
 *   - `pm.*` (Postman), and the same API as `insomnia.*` (Insomnia 9+)
 *   - the legacy Postman sandbox: `tests[...] = bool`, `responseBody`,
 *     `responseCode`, `postman.setEnvironmentVariable(...)`
 *   - Bruno's `bru`, `res`, `req`, `test()` and `expect()`
 * See `scriptCompat.ts` for what is not supported and how imports flag it.
 *
 * This module is pure and isolated-realm-friendly: it never touches IO. The
 * caller supplies the variable map and (for post scripts) the response.
 */

import { interpolate } from './interpolate'
import { expect } from './scriptExpect'

export interface ScriptResponse {
  status: number
  headers: Array<{ name: string; value: string }>
  body: string
  /** Parsed JSON body, or undefined when the body is not JSON. */
  json?: unknown
  timeMs: number
}

/** The request as scripts see it (read-only apart from header changes). */
export interface ScriptRequest {
  name?: string
  method: string
  url: string
  headers: Array<{ name: string; value: string; enabled?: boolean }>
  body?: string
}

export interface ScriptTestResult {
  name: string
  passed: boolean
  error?: string
}

/** A header a pre-request script added or replaced (`value`) or removed (no value). */
export interface HeaderChange {
  name: string
  value?: string
}

export interface ScriptRunResult {
  /** Variable changes the script made, to merge back into the environment. */
  vars: Record<string, string>
  /** console.log output, for the script console. */
  logs: string[]
  /** Assertions declared with tiger.test(...). */
  tests: ScriptTestResult[]
  /** Header changes from pm.request.headers.* / req.setHeader, in order. */
  headerChanges?: HeaderChange[]
  /** A thrown error that aborted the script, if any. */
  error?: string
}

function safeJson(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}

const REASONS: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout'
}

/** Apply script header changes to a request's header list. Pure. */
export function applyHeaderChanges<T extends { name: string; value: string; enabled: boolean }>(
  headers: T[],
  changes: HeaderChange[] | undefined
): Array<T | { name: string; value: string; enabled: boolean }> {
  let out: Array<T | { name: string; value: string; enabled: boolean }> = [...headers]
  for (const change of changes ?? []) {
    const lower = change.name.toLowerCase()
    out = out.filter((h) => h.name.toLowerCase() !== lower)
    if (change.value !== undefined) out.push({ name: change.name, value: change.value, enabled: true })
  }
  return out
}

function unsupported(api: string): () => never {
  return () => {
    throw new Error(`${api} is not supported in Tiger yet`)
  }
}

/** Names a script may declare itself; only inject a shim when it does not. */
function declares(source: string, name: string): boolean {
  return new RegExp(`\\b(?:let|const|class|function)\\s+${name}\\b`).test(source)
}

/**
 * Execute a script. `phase` selects the available API surface: post-response
 * scripts additionally get `tiger.response`. Returns collected effects; it never
 * throws (a script error is captured in `result.error`).
 */
export function runScript(
  source: string,
  ctx: { vars: Record<string, string>; response?: ScriptResponse; request?: ScriptRequest }
): ScriptRunResult {
  const vars: Record<string, string> = { ...ctx.vars }
  const logs: string[] = []
  const tests: ScriptTestResult[] = []
  const headerChanges: HeaderChange[] = []

  const response = ctx.response
    ? { ...ctx.response, json: ctx.response.json ?? safeJson(ctx.response.body) }
    : undefined

  const setVar = (name: unknown, value: unknown): void => {
    vars[String(name)] = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value)
  }
  const getVar = (name: unknown): string | undefined => vars[String(name)]
  const test = (name: unknown, fn: () => void): void => {
    try {
      fn()
      tests.push({ name: String(name), passed: true })
    } catch (e) {
      tests.push({ name: String(name), passed: false, error: (e as Error).message })
    }
  }
  const log = (...args: unknown[]): void => {
    logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
  }

  const api = {
    /** Read a variable from the active environment. */
    getVar,
    /** Set a variable; it merges back into the active environment. */
    setVar: (name: string, value: unknown): void => {
      vars[String(name)] = value == null ? '' : String(value)
    },
    /** The response (post-response scripts only). */
    response,
    /** Register a named assertion. The callback should throw on failure. */
    test,
    /** Throw if the condition is falsy (use inside tiger.test). */
    expect: (condition: unknown, message = 'Assertion failed'): void => {
      if (!condition) throw new Error(message)
    },
    log
  }

  if (!source.trim()) return { vars, logs, tests }

  const compat = buildCompat({ vars, getVar, setVar, test, log, response, request: ctx.request, headerChanges })
  // Legacy Postman: `tests["name"] = boolean`.
  const legacyTests: Record<string, unknown> = {}
  const injected: Record<string, unknown> = {
    pm: compat.pm,
    insomnia: compat.pm,
    postman: compat.postman,
    tests: legacyTests,
    responseBody: response?.body,
    responseCode: response
      ? { code: response.status, name: REASONS[response.status] ?? '', detail: '' }
      : undefined,
    responseTime: response?.timeMs,
    responseHeaders: response
      ? Object.fromEntries(response.headers.map((h) => [h.name, h.value]))
      : undefined,
    environment: { ...vars },
    globals: { ...vars },
    bru: compat.bru,
    res: compat.res,
    req: compat.req,
    test,
    expect
  }
  const names = Object.keys(injected).filter((n) => !declares(source, n))

  // Shadow ambient globals so scripts can't reach Node/DOM/network by accident.
  // This is not a hard security boundary against hostile code, but it keeps
  // scripts to the supported `tiger` API and prevents brittle global access.
  const shadowed = [
    'process',
    'require',
    'module',
    'exports',
    'global',
    'globalThis',
    'window',
    'document',
    'fetch',
    'XMLHttpRequest'
  ]

  let error: string | undefined
  try {
    const fn = new Function(
      'tiger',
      'console',
      ...names,
      ...shadowed,
      `"use strict";\n${source}`
    ) as (...a: unknown[]) => void
    fn(api, { log, info: log, warn: log, error: log, debug: log }, ...names.map((n) => injected[n]))
  } catch (e) {
    error = (e as Error).message
  }

  for (const [name, value] of Object.entries(legacyTests)) {
    tests.push(value ? { name, passed: true } : { name, passed: false, error: 'Assertion failed' })
  }

  return {
    vars,
    logs,
    tests,
    ...(headerChanges.length ? { headerChanges } : {}),
    ...(error !== undefined ? { error } : {})
  }
}

interface CompatContext {
  vars: Record<string, string>
  getVar: (name: unknown) => string | undefined
  setVar: (name: unknown, value: unknown) => void
  test: (name: unknown, fn: () => void) => void
  log: (...args: unknown[]) => void
  response?: ScriptResponse & { json: unknown }
  request?: ScriptRequest
  headerChanges: HeaderChange[]
}

function buildCompat(c: CompatContext) {
  const { vars, getVar, setVar, test, log, response, request, headerChanges } = c

  // Postman has five variable scopes; Tiger has one (the active environment),
  // so every scope reads and writes the same map.
  const scope = {
    get: getVar,
    set: setVar,
    has: (name: unknown): boolean => Object.prototype.hasOwnProperty.call(vars, String(name)),
    unset: (name: unknown): void => {
      delete vars[String(name)]
    },
    clear: (): void => {
      for (const k of Object.keys(vars)) delete vars[k]
    },
    toObject: (): Record<string, string> => ({ ...vars }),
    replaceIn: (text: unknown): string => interpolate(String(text ?? ''), vars),
    name: ''
  }

  const headerLookup = (list: Array<{ name: string; value: string }>) => (name: unknown) =>
    list.find((h) => h.name.toLowerCase() === String(name).toLowerCase())?.value

  const pmResponse = response
    ? {
        code: response.status,
        status: REASONS[response.status] ?? '',
        responseTime: response.timeMs,
        responseSize: response.body.length,
        json: (): unknown => {
          if (response.json === undefined) throw new Error('Response body is not valid JSON')
          return response.json
        },
        text: (): string => response.body,
        headers: {
          get: headerLookup(response.headers),
          has: (name: unknown): boolean => headerLookup(response.headers)(name) !== undefined,
          all: () => response.headers.map((h) => ({ key: h.name, value: h.value })),
          toObject: () => Object.fromEntries(response.headers.map((h) => [h.name.toLowerCase(), h.value]))
        },
        to: responseAssertion(response)
      }
    : undefined

  const requestHeaders = (): Array<{ name: string; value: string }> => {
    let list = (request?.headers ?? []).filter((h) => h.enabled !== false)
    for (const change of headerChanges) {
      list = list.filter((h) => h.name.toLowerCase() !== change.name.toLowerCase())
      if (change.value !== undefined) list.push({ name: change.name, value: change.value })
    }
    return list
  }
  const headerArg = (keyOrObj: unknown, value?: unknown): HeaderChange => {
    if (keyOrObj && typeof keyOrObj === 'object') {
      const o = keyOrObj as { key?: unknown; name?: unknown; value?: unknown }
      return { name: String(o.key ?? o.name ?? ''), value: String(o.value ?? '') }
    }
    return { name: String(keyOrObj), value: String(value ?? '') }
  }
  const url = request?.url ?? ''
  const pmRequest = {
    name: request?.name ?? '',
    method: (request?.method ?? '').toUpperCase(),
    url: {
      toString: () => url,
      getPath: () => url.replace(/^[a-z]+:\/\/[^/]*/i, '').split('?')[0] || '/',
      getQueryString: () => url.split('?')[1] ?? '',
      getHost: () => url.replace(/^[a-z]+:\/\//i, '').split(/[/:?]/)[0]
    },
    headers: {
      get: (name: unknown) => headerLookup(requestHeaders())(name),
      has: (name: unknown) => headerLookup(requestHeaders())(name) !== undefined,
      all: () => requestHeaders().map((h) => ({ key: h.name, value: h.value })),
      add: (h: unknown, v?: unknown) => {
        headerChanges.push(headerArg(h, v))
      },
      upsert: (h: unknown, v?: unknown) => {
        headerChanges.push(headerArg(h, v))
      },
      remove: (name: unknown) => {
        headerChanges.push({ name: String(name) })
      }
    },
    body: { raw: request?.body ?? '', toString: () => request?.body ?? '' }
  }

  const pm = {
    test,
    expect,
    environment: scope,
    variables: scope,
    collectionVariables: scope,
    globals: scope,
    response: pmResponse,
    request: pmRequest,
    info: {
      requestName: request?.name ?? '',
      eventName: response ? 'test' : 'prerequest',
      iteration: 0,
      iterationCount: 1,
      requestId: ''
    },
    iterationData: {
      get: (): undefined => undefined,
      has: (): boolean => false,
      toObject: () => ({})
    },
    execution: {
      setNextRequest: (name: unknown) => log(`Skipped pm.execution.setNextRequest(${JSON.stringify(name)}): the runner goes in order`),
      skipRequest: unsupported('pm.execution.skipRequest')
    },
    visualizer: { set: () => log('Skipped pm.visualizer.set: Tiger has no visualizer') },
    sendRequest: unsupported('pm.sendRequest'),
    cookies: {
      get: unsupported('pm.cookies'),
      has: unsupported('pm.cookies'),
      toObject: unsupported('pm.cookies'),
      jar: unsupported('pm.cookies.jar')
    },
    vault: { get: unsupported('pm.vault'), set: unsupported('pm.vault') },
    require: unsupported('pm.require')
  }

  const postman = {
    setEnvironmentVariable: setVar,
    getEnvironmentVariable: getVar,
    clearEnvironmentVariable: scope.unset,
    setGlobalVariable: setVar,
    getGlobalVariable: getVar,
    clearGlobalVariable: scope.unset,
    getResponseHeader: response ? headerLookup(response.headers) : () => undefined,
    setNextRequest: (name: unknown) => log(`Skipped postman.setNextRequest(${JSON.stringify(name)}): the runner goes in order`)
  }

  // Bruno.
  const bru = {
    getEnvVar: getVar,
    setEnvVar: setVar,
    getVar,
    setVar,
    hasVar: scope.has,
    deleteVar: scope.unset,
    getCollectionVar: getVar,
    getFolderVar: getVar,
    getRequestVar: getVar,
    getProcessEnv: (): undefined => undefined,
    interpolate: scope.replaceIn,
    setNextRequest: (name: unknown) => log(`Skipped bru.setNextRequest(${JSON.stringify(name)}): the runner goes in order`),
    runRequest: unsupported('bru.runRequest'),
    sendRequest: unsupported('bru.sendRequest'),
    sleep: unsupported('bru.sleep')
  }
  const res = response
    ? {
        status: response.status,
        statusText: REASONS[response.status] ?? '',
        headers: Object.fromEntries(response.headers.map((h) => [h.name.toLowerCase(), h.value])),
        body: response.json ?? response.body,
        responseTime: response.timeMs,
        getStatus: () => response.status,
        getStatusText: () => REASONS[response.status] ?? '',
        getHeader: headerLookup(response.headers),
        getHeaders: () =>
          Object.fromEntries(response.headers.map((h) => [h.name.toLowerCase(), h.value])),
        getBody: () => response.json ?? response.body,
        getResponseTime: () => response.timeMs
      }
    : undefined
  const req = {
    getUrl: () => url,
    getMethod: () => pmRequest.method,
    getName: () => pmRequest.name,
    getHeader: (name: unknown) => pmRequest.headers.get(name),
    getHeaders: () => Object.fromEntries(requestHeaders().map((h) => [h.name, h.value])),
    setHeader: (name: unknown, value: unknown) => {
      headerChanges.push({ name: String(name), value: String(value ?? '') })
    },
    deleteHeader: (name: unknown) => {
      headerChanges.push({ name: String(name) })
    },
    getBody: () => (request?.body !== undefined ? (safeJson(request.body) ?? request.body) : undefined)
  }

  return { pm, postman, bru, res, req }
}

/** `pm.response.to.have.status(200)`, `pm.response.to.be.ok`, and friends. */
function responseAssertion(response: ScriptResponse & { json: unknown }) {
  let negate = false
  const check = (pass: boolean, positive: string, negative: string) => {
    if (pass === negate) throw new Error(negate ? negative : positive)
  }
  const header = (name: string) =>
    response.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value
  const chain = {
    get have() {
      return chain
    },
    get be() {
      return chain
    },
    get not() {
      negate = !negate
      return chain
    },
    get and() {
      return chain
    },
    status(code: number | string) {
      const pass =
        typeof code === 'number' ? response.status === code : (REASONS[response.status] ?? '') === code
      check(
        pass,
        `expected response to have status ${code} but got ${response.status}`,
        `expected response to not have status ${code}`
      )
      return chain
    },
    header(name: string, value?: string) {
      const got = header(name)
      const pass = got !== undefined && (value === undefined || got === value)
      check(
        pass,
        value === undefined
          ? `expected response to have header ${name}`
          : `expected response header ${name} to be '${value}' but got '${got ?? ''}'`,
        `expected response to not have header ${name}`
      )
      return chain
    },
    body(text?: string) {
      const pass = text === undefined ? response.body.length > 0 : response.body === text
      check(pass, 'expected response body to match', 'expected response body to not match')
      return chain
    },
    jsonBody(path?: string) {
      const json = response.json
      let pass = json !== undefined
      if (pass && path) {
        let cur: unknown = json
        for (const part of path.split('.')) {
          cur = cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[part] : undefined
        }
        pass = cur !== undefined
      }
      check(pass, `expected response to have JSON body${path ? ` with ${path}` : ''}`, 'expected response to not have a JSON body')
      return chain
    },
    get ok() {
      check(
        response.status >= 200 && response.status < 300,
        `expected response code to be 2XX but got ${response.status}`,
        `expected response code to not be 2XX`
      )
      return chain
    },
    get success() {
      return chain.ok
    },
    get json() {
      check(response.json !== undefined, 'expected response body to be valid JSON', 'expected response body to not be JSON')
      return chain
    },
    get clientError() {
      check(
        response.status >= 400 && response.status < 500,
        `expected response code to be 4XX but got ${response.status}`,
        'expected response code to not be 4XX'
      )
      return chain
    },
    get serverError() {
      check(
        response.status >= 500,
        `expected response code to be 5XX but got ${response.status}`,
        'expected response code to not be 5XX'
      )
      return chain
    },
    get notFound() {
      return chain.status(404)
    },
    get unauthorized() {
      return chain.status(401)
    },
    get forbidden() {
      return chain.status(403)
    },
    get badRequest() {
      return chain.status(400)
    }
  }
  // Each `pm.response.to` access starts a fresh, non-negated chain.
  return new Proxy(
    {},
    {
      get(_t, prop) {
        negate = false
        return (chain as Record<string | symbol, unknown>)[prop]
      }
    }
  ) as typeof chain
}
