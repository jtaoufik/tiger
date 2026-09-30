/**
 * Data shapes shared by the script runtime, the script host protocol and the
 * app window, plus the pure helper that applies a pre-request script's header
 * changes to the request being sent.
 *
 * Nothing here evaluates code, so the app window and the runner may import it
 * as values. The evaluator itself (`runScript` in ./script) only runs inside the
 * isolated script host.
 */

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
