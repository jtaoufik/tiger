import { buildRequest } from '@core/request'
import { assembleMultipart, generateBoundary } from '@core/multipart'
import { envToVars, interpolate, type VarMap } from '@core/interpolate'
import { formatResponse, type FormattedResponse, type RawResponse } from '@core/response'
import { t } from './i18n'
import type { TigerAuth, TigerEnvironment, TigerRequest } from '@core/types'

type OAuth2 = Extract<TigerAuth, { type: 'oauth2' }>

/** What the Code tab shows for an OAuth2 request before any token was obtained. */
export const OAUTH_TOKEN_PLACEHOLDER = '<access_token>'

/** The token each OAuth2 setup last yielded, so the Code tab can show it without a network call. */
const knownTokens = new Map<string, string>()

function tokenKey(auth: OAuth2, vars: VarMap): string {
  return JSON.stringify([
    interpolate(auth.tokenUrl, vars),
    interpolate(auth.clientId, vars),
    interpolate(auth.clientSecret, vars),
    interpolate(auth.scope, vars)
  ])
}

/**
 * The request as it goes out: an OAuth2 auth becomes the bearer token it
 * yields. Main reuses a token until it expires, so this only reaches the
 * token endpoint when needed. Send, the runner, the load test and Copy as
 * curl all go through here.
 */
export async function withOAuthToken(req: TigerRequest, vars: VarMap): Promise<TigerRequest> {
  if (req.auth?.type !== 'oauth2' || !window.tiger?.oauthToken) return req
  const token = await window.tiger.oauthToken(req.auth, vars)
  knownTokens.set(tokenKey(req.auth, vars), token)
  return { ...req, auth: { type: 'bearer', token } }
}

/**
 * Display-only twin of withOAuthToken for the Code tab: the token obtained
 * last for this setup, else a placeholder. Never touches the network.
 */
export function withKnownOAuthToken(req: TigerRequest, vars: VarMap): TigerRequest {
  if (req.auth?.type !== 'oauth2') return req
  const token = knownTokens.get(tokenKey(req.auth, vars)) ?? OAUTH_TOKEN_PLACEHOLDER
  return { ...req, auth: { type: 'bearer', token } }
}

/** Browser-preview fallback controllers, keyed like the main-process ones. */
const browserInFlight = new Map<string, AbortController>()

export async function cancelRequest(key: string): Promise<void> {
  browserInFlight.get(key)?.abort()
  await window.tiger?.cancelSend?.(key)
}

/**
 * Run a request through the main process when running under Electron, or fall
 * back to a direct fetch in a plain browser (dev previews).
 */
export async function runRequest(
  req: TigerRequest,
  env: TigerEnvironment | null,
  timeoutMs: number,
  cancelKey?: string
): Promise<FormattedResponse> {
  const vars = envToVars(env)

  // OAuth2 client-credentials needs a token exchange first (done in main).
  const effective = await withOAuthToken(req, vars)

  const built = buildRequest(effective, vars)

  let raw: RawResponse
  try {
    if (window.tiger) {
      raw = await window.tiger.send(built, timeoutMs, cancelKey)
    } else {
      const controller = new AbortController()
      if (cancelKey) browserInFlight.set(cancelKey, controller)
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const started = performance.now()
      try {
        // multipart in the browser preview: text fields work; file rows need
        // the desktop app (the browser cannot read arbitrary disk paths).
        let bodyPayload: BodyInit | undefined = built.body
        let sendHeaders = built.headers
        if (built.multipart?.length) {
          if (built.multipart.some((p) => p.isFile)) {
            throw new Error(t('response.error.desktopUpload'))
          }
          const assembled = assembleMultipart(
            built.multipart.map((p) => ({ name: p.name, value: p.value })),
            generateBoundary()
          )
          bodyPayload = assembled.bytes as unknown as BodyInit
          sendHeaders = { ...sendHeaders, 'Content-Type': assembled.contentType }
        }
        const res = await fetch(built.url, {
          method: built.method,
          headers: sendHeaders,
          body: bodyPayload,
          signal: controller.signal
        })
        const headersAt = performance.now()
        const body = await res.text()
        const endAt = performance.now()
        const headers: Record<string, string> = {}
        res.headers.forEach((value, key) => {
          headers[key] = value
        })
        raw = {
          status: res.status,
          statusText: res.statusText,
          headers,
          body,
          timeMs: Math.round(endAt - started),
          timings: {
            total: Math.round(endAt - started),
            waiting: Math.round(headersAt - started),
            download: Math.round(endAt - headersAt)
          }
        }
      } finally {
        clearTimeout(timer)
        if (cancelKey) browserInFlight.delete(cancelKey)
      }
    }
  } catch (e) {
    const message = (e as Error).message ?? ''
    if ((e as Error).name === 'AbortError' || /abort/i.test(message)) {
      throw new Error(t('response.error.cancelled'))
    }
    throw e
  }

  // A cached OAuth2 token the API now refuses (revoked, server restarted):
  // forget it, so the next send asks the token endpoint for a fresh one.
  if (raw.status === 401 && req.auth?.type === 'oauth2') {
    knownTokens.delete(tokenKey(req.auth, vars))
    await window.tiger?.oauthForget?.(req.auth, vars)
  }

  return formatResponse(raw)
}
