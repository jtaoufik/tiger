/**
 * Wire protocol for the isolated script host.
 *
 * Pre-request and post-response scripts come from collections, including ones
 * imported from third parties, so they never run in the app window (which holds
 * `window.tiger` with file and git access, and whose CSP forbids eval). The
 * desktop app runs them in a separate sandboxed renderer (see
 * src/main/scriptHost.ts): the app sends a plain-JSON `ScriptJob`, the host
 * evaluates it with `runScript`, and plain-JSON `ScriptRunResult` comes back.
 *
 * Everything here is pure: job validation, the host-side `executeJob`, result
 * sanitising, and the queue that enforces one job at a time plus a timeout by
 * killing and respawning a hung host. The Electron wiring injects the host.
 */

import { runScript } from './script'
import type {
  HeaderChange,
  ScriptRequest,
  ScriptResponse,
  ScriptRunResult,
  ScriptTestResult
} from './scriptTypes'

export const SCRIPT_LIMITS = {
  /** Source text of one script. */
  maxSourceChars: 256 * 1024,
  /** Timeout used when a job does not ask for one. */
  defaultTimeoutMs: 5_000,
  minTimeoutMs: 50,
  maxTimeoutMs: 60_000,
  /** Collected output kept per run; anything past these is dropped. */
  maxLogs: 500,
  maxLogChars: 10_000,
  maxTests: 1_000,
  maxVars: 2_000,
  /** Request headers sent in, and header changes a script may return. */
  maxHeaders: 1_000,
  maxNameChars: 1_000,
  maxValueChars: 1024 * 1024,
  /** Hard ceiling on a whole serialized result. */
  maxResultChars: 8 * 1024 * 1024
} as const

/** What the app sends to the host. Plain JSON only. */
export interface ScriptJob {
  source: string
  vars: Record<string, string>
  /** Present for post-response scripts. `json` is re-derived from `body` by the host. */
  response?: Omit<ScriptResponse, 'json'>
  /**
   * The request as the script sees it (pm.request, req, insomnia.request).
   * Header changes the script makes come back in `ScriptRunResult.headerChanges`
   * and the app applies them on send.
   */
  request?: ScriptRequest
  timeoutMs?: number
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function stringMap(input: unknown, what: string): Record<string, string> {
  if (input === undefined) return {}
  if (!isRecord(input)) throw new Error(`${what} must be an object`)
  const out: Record<string, string> = Object.create(null)
  for (const [k, v] of Object.entries(input)) out[k] = v == null ? '' : String(v)
  return { ...out }
}

/**
 * Copy an untrusted job into a fresh plain object with only known fields, so no
 * prototype, getter or extra key crosses into the host. Throws on a bad shape.
 */
export function validateJob(input: unknown): ScriptJob {
  if (!isRecord(input)) throw new Error('Script job must be an object')
  if (typeof input.source !== 'string') throw new Error('Script source must be a string')
  if (input.source.length > SCRIPT_LIMITS.maxSourceChars) {
    throw new Error(`Script is too long (max ${SCRIPT_LIMITS.maxSourceChars} characters)`)
  }
  const job: ScriptJob = {
    source: input.source,
    vars: stringMap(input.vars, 'vars')
  }

  if (input.response !== undefined && input.response !== null) {
    const r = input.response
    if (!isRecord(r)) throw new Error('response must be an object')
    const headers = Array.isArray(r.headers) ? r.headers : []
    job.response = {
      status: Number(r.status) || 0,
      timeMs: Number(r.timeMs) || 0,
      body: typeof r.body === 'string' ? r.body : '',
      headers: headers.filter(isRecord).map((h) => ({
        name: String(h.name ?? ''),
        value: String(h.value ?? '')
      }))
    }
  }

  if (input.request !== undefined && input.request !== null) {
    const r = input.request
    if (!isRecord(r)) throw new Error('request must be an object')
    const headers = Array.isArray(r.headers) ? r.headers : []
    const request: ScriptRequest = {
      method: String(r.method ?? ''),
      url: String(r.url ?? ''),
      headers: headers
        .slice(0, SCRIPT_LIMITS.maxHeaders)
        .filter(isRecord)
        .map((h) => {
          const header: { name: string; value: string; enabled?: boolean } = {
            name: String(h.name ?? ''),
            value: String(h.value ?? '')
          }
          if (h.enabled === false) header.enabled = false
          return header
        })
    }
    if (r.name !== undefined && r.name !== null) request.name = String(r.name)
    if (typeof r.body === 'string') request.body = r.body
    job.request = request
  }

  if (input.timeoutMs !== undefined) {
    const t = Number(input.timeoutMs)
    if (!Number.isFinite(t)) throw new Error('timeoutMs must be a number')
    job.timeoutMs = clampTimeout(t)
  }
  return job
}

export function clampTimeout(ms: number | undefined): number {
  if (ms === undefined || !Number.isFinite(ms)) return SCRIPT_LIMITS.defaultTimeoutMs
  return Math.min(SCRIPT_LIMITS.maxTimeoutMs, Math.max(SCRIPT_LIMITS.minTimeoutMs, Math.round(ms)))
}

const clip = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max)}… [truncated ${s.length - max} chars]` : s

/**
 * Normalise anything claiming to be a result into a bounded, strings-only
 * `ScriptRunResult`. Used on both sides: the host caps its own output, and the
 * main process re-checks whatever the host returned before it reaches the app.
 */
export function sanitizeResult(raw: unknown, fallbackVars: Record<string, string> = {}): ScriptRunResult {
  if (!isRecord(raw)) {
    return {
      vars: { ...fallbackVars },
      logs: [],
      tests: [],
      error: 'Script host returned no result'
    }
  }

  const vars: Record<string, string> = {}
  const rawVars = isRecord(raw.vars) ? Object.entries(raw.vars) : Object.entries(fallbackVars)
  for (const [k, v] of rawVars.slice(0, SCRIPT_LIMITS.maxVars)) {
    const key = clip(String(k), SCRIPT_LIMITS.maxNameChars)
    // __proto__ and friends become ordinary own keys via defineProperty.
    Object.defineProperty(vars, key, {
      value: clip(v == null ? '' : String(v), SCRIPT_LIMITS.maxValueChars),
      enumerable: true,
      writable: true,
      configurable: true
    })
  }

  const rawLogs = Array.isArray(raw.logs) ? raw.logs : []
  const logs = rawLogs.slice(0, SCRIPT_LIMITS.maxLogs).map((l) => clip(String(l), SCRIPT_LIMITS.maxLogChars))
  if (rawLogs.length > SCRIPT_LIMITS.maxLogs) {
    logs.push(`… ${rawLogs.length - SCRIPT_LIMITS.maxLogs} more log lines dropped`)
  }

  const rawTests = Array.isArray(raw.tests) ? raw.tests : []
  const tests: ScriptTestResult[] = rawTests
    .slice(0, SCRIPT_LIMITS.maxTests)
    .filter(isRecord)
    .map((t) => {
      const test: ScriptTestResult = {
        name: clip(String(t.name ?? ''), SCRIPT_LIMITS.maxNameChars),
        passed: t.passed === true
      }
      if (t.error !== undefined && t.error !== null) {
        test.error = clip(String(t.error), SCRIPT_LIMITS.maxLogChars)
      }
      return test
    })

  const result: ScriptRunResult = { vars, logs, tests }
  if (Array.isArray(raw.headerChanges)) {
    const headerChanges: HeaderChange[] = raw.headerChanges
      .slice(0, SCRIPT_LIMITS.maxHeaders)
      .filter(isRecord)
      .map((h) => {
        const change: HeaderChange = { name: clip(String(h.name ?? ''), SCRIPT_LIMITS.maxNameChars) }
        if (h.value !== undefined && h.value !== null) {
          change.value = clip(String(h.value), SCRIPT_LIMITS.maxValueChars)
        }
        return change
      })
      .filter((h) => h.name !== '')
    if (headerChanges.length) result.headerChanges = headerChanges
  }
  if (raw.error !== undefined && raw.error !== null) {
    result.error = clip(String(raw.error), SCRIPT_LIMITS.maxLogChars)
  }

  if (JSON.stringify(result).length > SCRIPT_LIMITS.maxResultChars) {
    return {
      vars: { ...fallbackVars },
      logs: [],
      tests: [],
      error: `Script output is too large (max ${SCRIPT_LIMITS.maxResultChars} characters)`
    }
  }
  return result
}

/**
 * Host side: run one job and return a bounded, serialisable result. Never
 * throws. This is the only place a script source is evaluated in the desktop
 * app, and it only ever runs inside the isolated script host.
 */
export function executeJob(input: unknown): ScriptRunResult {
  let job: ScriptJob
  try {
    job = validateJob(input)
  } catch (e) {
    return { vars: {}, logs: [], tests: [], error: (e as Error).message }
  }
  const raw = runScript(job.source, { vars: job.vars, response: job.response, request: job.request })
  return sanitizeResult(raw, job.vars)
}

// ---------------------------------------------------------------------------
// Queue: one host, one job at a time, hard timeout by killing the host.
// ---------------------------------------------------------------------------

/** One live isolated host. `run` resolves with the host's raw reply. */
export interface ScriptHost {
  run(job: ScriptJob): Promise<unknown>
  /** Tear the host down immediately, even mid-script (infinite loop). */
  kill(): void
}

export interface ScriptHostQueue {
  run(job: unknown): Promise<ScriptRunResult>
  /** Kill the current host, if any. The next job spawns a fresh one. */
  dispose(): void
}

const TIMEOUT = Symbol('timeout')

export function createScriptHostQueue(spawn: () => ScriptHost): ScriptHostQueue {
  let host: ScriptHost | null = null
  let tail: Promise<unknown> = Promise.resolve()

  const killHost = (): void => {
    const h = host
    host = null
    try {
      h?.kill()
    } catch {
      /* already gone */
    }
  }

  const runOne = async (input: unknown): Promise<ScriptRunResult> => {
    let job: ScriptJob
    try {
      job = validateJob(input)
    } catch (e) {
      const vars = isRecord(input) && isRecord(input.vars) ? stringMap(input.vars, 'vars') : {}
      return { vars, logs: [], tests: [], error: (e as Error).message }
    }
    if (!job.source.trim()) return { vars: { ...job.vars }, logs: [], tests: [] }

    const timeoutMs = clampTimeout(job.timeoutMs)
    const failed = (error: string): ScriptRunResult => ({
      vars: { ...job.vars },
      logs: [],
      tests: [],
      error
    })

    let current: ScriptHost
    try {
      current = host ??= spawn()
    } catch (e) {
      return failed(`Script sandbox failed to start: ${(e as Error).message}`)
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<typeof TIMEOUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMEOUT), timeoutMs)
    })
    try {
      const reply = await Promise.race([current.run(job), timedOut])
      if (reply === TIMEOUT) {
        // A synchronous infinite loop never yields; the only way out is to kill
        // the host process. The next job gets a fresh one.
        if (host === current) killHost()
        return failed(`Script timed out after ${timeoutMs} ms`)
      }
      return sanitizeResult(reply, job.vars)
    } catch (e) {
      if (host === current) killHost()
      return failed(`Script sandbox error: ${(e as Error).message}`)
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    run(input) {
      const next = tail.then(() => runOne(input))
      tail = next.catch(() => undefined)
      return next
    },
    dispose: killHost
  }
}
