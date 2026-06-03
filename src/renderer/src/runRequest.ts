import { buildRequest } from '@core/request'
import { envToVars } from '@core/interpolate'
import { formatResponse, type FormattedResponse, type RawResponse } from '@core/response'
import type { TigerEnvironment, TigerRequest } from '@core/types'

/**
 * Run a request through the main process when running under Electron, or fall
 * back to a direct fetch in a plain browser (dev / Storybook style previews).
 */
export async function runRequest(
  req: TigerRequest,
  env: TigerEnvironment | null,
  timeoutMs: number
): Promise<FormattedResponse> {
  const vars = envToVars(env)

  // OAuth2 client-credentials needs a token exchange first (done in main).
  let effective = req
  if (req.auth?.type === 'oauth2' && window.tiger?.oauthToken) {
    const token = await window.tiger.oauthToken(req.auth, vars)
    effective = { ...req, auth: { type: 'bearer', token } }
  }

  const built = buildRequest(effective, vars)

  let raw: RawResponse
  if (window.tiger) {
    raw = await window.tiger.send(built, timeoutMs)
  } else {
    const started = performance.now()
    const res = await fetch(built.url, {
      method: built.method,
      headers: built.headers,
      body: built.body
    })
    const body = await res.text()
    const headers: Record<string, string> = {}
    res.headers.forEach((value, key) => {
      headers[key] = value
    })
    raw = {
      status: res.status,
      statusText: res.statusText,
      headers,
      body,
      timeMs: Math.round(performance.now() - started)
    }
  }

  return formatResponse(raw)
}
