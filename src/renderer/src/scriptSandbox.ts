/**
 * The app window's only way to run a collection script. The script is sent as
 * plain JSON to the isolated script host (see src/main/scriptHost.ts) and the
 * plain-JSON result comes back. Nothing here evaluates code: this window's CSP
 * forbids eval on purpose, and it holds window.tiger.
 */
import { t } from './i18n'
import type { ScriptRequest, ScriptResponse, ScriptRunResult } from '@core/scriptTypes'

export type ScriptRunner = (
  source: string,
  ctx: { vars: Record<string, string>; response?: ScriptResponse; request?: ScriptRequest }
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
      error: t('request.script.desktopOnly')
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
  // Plain JSON only: copy the fields the host reads, nothing else.
  const request = ctx.request
    ? {
        name: ctx.request.name,
        method: ctx.request.method,
        url: ctx.request.url,
        headers: ctx.request.headers.map((h) => ({
          name: h.name,
          value: h.value,
          ...(h.enabled === false ? { enabled: false } : {})
        })),
        body: ctx.request.body
      }
    : undefined
  try {
    return await run({ source, vars, response, request })
  } catch (e) {
    return { vars, logs: [], tests: [], error: (e as Error).message }
  }
}
