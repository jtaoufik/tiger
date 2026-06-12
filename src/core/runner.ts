/**
 * Collection runner: execute a list of requests sequentially, threading
 * variables through pre-request scripts, capture blocks and post-response
 * scripts, and judging each request passed/failed from its script tests.
 *
 * Pure with respect to IO: the actual HTTP send is injected, so the runner is
 * unit-testable and the UI/CLI decide how requests hit the network.
 */

import { extractCaptures } from './capture'
import { runScript, type ScriptTestResult } from './script'
import type { TigerRequest } from './types'

export interface RunnerItem {
  id: string
  name: string
  /** The request with auth inheritance already applied by the caller. */
  request: TigerRequest
}

export interface RunnerExecution {
  status: number
  headers: Array<{ name: string; value: string }>
  body: string
  timeMs: number
}

export interface RunnerResult {
  id: string
  name: string
  method: string
  /** HTTP status, when a response arrived. */
  status?: number
  timeMs?: number
  tests: ScriptTestResult[]
  /** Transport or script error that aborted this request. */
  error?: string
  /**
   * Overall verdict: response arrived with a non-error status (< 400) and every
   * script test passed. Requests without tests pass on the status alone.
   */
  passed: boolean
}

export interface RunnerSummary {
  results: RunnerResult[]
  passed: number
  failed: number
  /** Variables as they ended up after all scripts and captures. */
  vars: Record<string, string>
  /** True when the run was stopped before completing all items. */
  stopped: boolean
}

export interface RunnerOptions {
  /** Initial variables (usually the active environment). */
  vars: Record<string, string>
  /** Send the request with the given variables; throws on transport errors. */
  execute: (request: TigerRequest, vars: Record<string, string>) => Promise<RunnerExecution>
  /** Live progress callback, fired after each request settles. */
  onResult?: (result: RunnerResult, index: number, total: number) => void
  /** Checked before each request; return true to stop the run. */
  shouldStop?: () => boolean
}

export async function runCollection(
  items: RunnerItem[],
  options: RunnerOptions
): Promise<RunnerSummary> {
  let vars = { ...options.vars }
  const results: RunnerResult[] = []
  let stopped = false

  for (let i = 0; i < items.length; i++) {
    if (options.shouldStop?.()) {
      stopped = true
      break
    }
    const { id, name, request } = items[i]
    const result: RunnerResult = { id, name, method: request.method, tests: [], passed: false }

    try {
      // Pre-request script may set variables used by this and later requests.
      if (request.preScript?.trim()) {
        const pre = runScript(request.preScript, { vars })
        if (pre.error) throw new Error(`Pre-request script: ${pre.error}`)
        vars = pre.vars
      }

      const res = await options.execute(request, vars)
      result.status = res.status
      result.timeMs = res.timeMs

      // Capture blocks feed variables to the requests that follow.
      if (request.captures?.length) {
        for (const captured of extractCaptures(request.captures, {
          status: res.status,
          headers: res.headers,
          body: res.body
        })) {
          vars[captured.name] = captured.value
        }
      }

      if (request.postScript?.trim()) {
        const post = runScript(request.postScript, {
          vars,
          response: { status: res.status, headers: res.headers, body: res.body, timeMs: res.timeMs }
        })
        if (post.error) throw new Error(`Post-response script: ${post.error}`)
        vars = post.vars
        result.tests = post.tests
      }

      result.passed = res.status < 400 && result.tests.every((t) => t.passed)
    } catch (e) {
      result.error = (e as Error).message
      result.passed = false
    }

    results.push(result)
    options.onResult?.(result, i, items.length)
  }

  return {
    results,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    vars,
    stopped
  }
}
