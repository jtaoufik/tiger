import { net, session } from 'electron'
import type { BuiltRequest } from '../core/request'
import type { RawResponse } from '../core/response'
import { interpolate, type VarMap } from '../core/interpolate'
import {
  buildMeasurementPayload,
  measurementEndpoint,
  type AnalyticsEvent
} from '../core/analytics'
import type { TigerAuth } from '../core/types'
import { loadSettings } from './settings'

/**
 * Push proxy + TLS settings into the Chromium session that backs `net.fetch`.
 * Call at startup and whenever advanced settings change.
 */
export function applyNetworkSettings(): void {
  const s = loadSettings()
  const ses = session.defaultSession
  ses.setProxy(
    s.proxyEnabled && s.proxyUrl
      ? { mode: 'fixed_servers', proxyRules: s.proxyUrl }
      : { mode: 'direct' }
  )
  // cb(0) = trust, cb(-3) = use Chromium's default verification.
  ses.setCertificateVerifyProc((_req, cb) => cb(s.sslVerify ? -3 : 0))
}

export async function sendHttp(built: BuiltRequest, timeoutMs = 30000): Promise<RawResponse> {
  const s = loadSettings()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()

  try {
    const res = await net.fetch(built.url, {
      method: built.method,
      headers: built.headers,
      body: built.body,
      signal: controller.signal,
      redirect: s.followRedirects ? 'follow' : 'manual'
    })
    const body = await res.text()
    const headers: Record<string, string> = {}
    res.headers.forEach((value, key) => {
      headers[key] = value
    })
    return {
      status: res.status,
      statusText: res.statusText,
      headers,
      body,
      timeMs: Date.now() - started
    }
  } finally {
    clearTimeout(timer)
  }
}

type OAuth2 = Extract<TigerAuth, { type: 'oauth2' }>

/** Client-credentials token exchange, run in main so it bypasses CORS. */
export async function getOAuthToken(auth: OAuth2, vars: VarMap): Promise<string> {
  const body = new URLSearchParams({
    grant_type: auth.grantType,
    client_id: interpolate(auth.clientId, vars),
    client_secret: interpolate(auth.clientSecret, vars)
  })
  if (auth.scope) body.append('scope', interpolate(auth.scope, vars))

  const res = await net.fetch(interpolate(auth.tokenUrl, vars), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })
  if (!res.ok) throw new Error(`Token endpoint returned ${res.status}`)
  const json = (await res.json()) as { access_token?: string }
  if (!json.access_token) throw new Error('Token response had no access_token')
  return json.access_token
}

/** Fire an analytics event, but only when enabled and configured. */
export async function track(event: AnalyticsEvent): Promise<void> {
  const s = loadSettings()
  if (!s.analyticsEnabled || !s.measurementId || !s.apiSecret) return
  try {
    await net.fetch(measurementEndpoint(s.measurementId, s.apiSecret), {
      method: 'POST',
      body: JSON.stringify(buildMeasurementPayload(s.clientId, [event]))
    })
  } catch {
    // Analytics must never disrupt the app.
  }
}
