/**
 * The app window's only way to run a collection script. The script is sent as
 * plain JSON to the isolated script host (see src/main/scriptHost.ts) and the
 * plain-JSON result comes back. Nothing here evaluates code: this window's CSP
 * forbids eval on purpose, and it holds window.tiger.
 */
import type { ScriptResponse, ScriptRunResult } from '@core/script'

export type ScriptRunner = (
  source: string,
  ctx: { vars: Record<string, string>; response?: ScriptResponse }
) => Promise<ScriptRunResult>

export const runScriptIsolated: ScriptRunner = async (source, ctx) => {
  const vars = { ...ctx.vars }
  if (!source.trim()) return { vars, logs: [], tests: [] }
  const run = window.tiger?.runScript
  if (!run) {
    return {
      vars,
      logs: [],
      tests: [],
      error: 'Scripts run in the Tiger desktop app only'
    }
  }
  const response = ctx.response
    ? {
        status: ctx.response.status,
        headers: ctx.response.headers,
        body: ctx.response.body,
        timeMs: ctx.response.timeMs
      }
    : undefined
  try {
    return await run({ source, vars, response })
  } catch (e) {
    return { vars, logs: [], tests: [], error: (e as Error).message }
  }
}
