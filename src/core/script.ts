/**
 * Pre-request and post-response scripting. Scripts are small JavaScript snippets
 * run with a `tiger` API object. They can read/modify variables, read the
 * request, inspect the response (post only) and assert.
 *
 * `runScript` evaluates source text with `new Function`, so it must never run in
 * the app window: that window's CSP forbids eval, and it holds `window.tiger`
 * (file and repository access). The desktop app runs it only inside the
 * isolated script host (a sandboxed renderer with no preload and no network, see
 * src/main/scriptHost.ts and src/core/scriptProtocol.ts). App code calls
 * `window.tiger.runScript` through src/renderer/src/scriptSandbox.ts instead.
 *
 * This module is pure: it never touches IO. The caller supplies the variable
 * map and (for post scripts) the response.
 */

export interface ScriptResponse {
  status: number
  headers: Array<{ name: string; value: string }>
  body: string
  /** Parsed JSON body, or undefined when the body is not JSON. */
  json?: unknown
  timeMs: number
}

export interface ScriptTestResult {
  name: string
  passed: boolean
  error?: string
}

export interface ScriptRunResult {
  /** Variable changes the script made, to merge back into the environment. */
  vars: Record<string, string>
  /** console.log output, for the script console. */
  logs: string[]
  /** Assertions declared with tiger.test(...). */
  tests: ScriptTestResult[]
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

/**
 * Execute a script. `phase` selects the available API surface: post-response
 * scripts additionally get `tiger.response`. Returns collected effects; it never
 * throws (a script error is captured in `result.error`).
 */
export function runScript(
  source: string,
  ctx: { vars: Record<string, string>; response?: ScriptResponse }
): ScriptRunResult {
  const vars: Record<string, string> = { ...ctx.vars }
  const logs: string[] = []
  const tests: ScriptTestResult[] = []

  const response = ctx.response
    ? { ...ctx.response, json: ctx.response.json ?? safeJson(ctx.response.body) }
    : undefined

  const api = {
    /** Read a variable from the active environment. */
    getVar: (name: string): string | undefined => vars[name],
    /** Set a variable; it merges back into the active environment. */
    setVar: (name: string, value: unknown): void => {
      vars[String(name)] = value == null ? '' : String(value)
    },
    /** The response (post-response scripts only). */
    response,
    /** Register a named assertion. The callback should throw on failure. */
    test: (name: string, fn: () => void): void => {
      try {
        fn()
        tests.push({ name: String(name), passed: true })
      } catch (e) {
        tests.push({ name: String(name), passed: false, error: (e as Error).message })
      }
    },
    /** Throw if the condition is falsy (use inside tiger.test). */
    expect: (condition: unknown, message = 'Assertion failed'): void => {
      if (!condition) throw new Error(message)
    },
    log: (...args: unknown[]): void => {
      logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
    }
  }

  if (!source.trim()) return { vars, logs, tests }

  // Shadow ambient globals so scripts stick to the supported `tiger` API. This is
  // not the security boundary: isolation comes from the process the script host
  // runs in (sandboxed, no preload, CSP connect-src 'none', network blocked).
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

  try {
    const fn = new Function(
      'tiger',
      'console',
      ...shadowed,
      `"use strict";\n${source}`
    ) as (...a: unknown[]) => void
    fn(api, { log: api.log })
  } catch (e) {
    return { vars, logs, tests, error: (e as Error).message }
  }

  return { vars, logs, tests }
}
