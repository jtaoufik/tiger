import { net, session } from 'electron'
import { readFileSync } from 'node:fs'
import { request as httpsRequest, type RequestOptions } from 'node:https'
import { request as httpRequest } from 'node:http'
import { cookieHeaderFor, storeCookies } from './cookieJar'
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
  // cb(0) = trust, cb(-3) = use Chromium's default verification. Scoped
  // exceptions beat the all-or-nothing switch for internal CAs.
  const exceptions = new Set(
    s.certExceptions
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)
  )
  ses.setCertificateVerifyProc((req, cb) => {
    if (!s.sslVerify) return cb(0)
    cb(exceptions.has(req.hostname.toLowerCase()) ? 0 : -3)
  })
}

/** In-flight sends by renderer-chosen key, so the user can cancel them. */
const inFlight = new Map<string, AbortController>()

export function cancelSend(key: string): boolean {
  const controller = inFlight.get(key)
  if (!controller) return false
  controller.abort()
  return true
}

/** True when imported certificate files require the Node TLS send path. */
function tlsConfigured(s: ReturnType<typeof loadSettings>): boolean {
  return !!(s.caFile || s.clientPfxFile || (s.clientCertFile && s.clientKeyFile))
}

function hostExcepted(s: ReturnType<typeof loadSettings>, hostname: string): boolean {
  return s.certExceptions
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
    .includes(hostname.toLowerCase())
}

/**
 * Send via node:https so imported certificates work: custom CA bundles and
 * client certificates (PEM pair or PFX). Follows redirects manually. Note:
 * this path does not go through the Chromium proxy.
 */
function sendViaNode(built: BuiltRequest, controller: AbortController): Promise<RawResponse> {
  const s = loadSettings()
  const started = Date.now()

  const tls: Pick<RequestOptions, 'ca' | 'cert' | 'key' | 'pfx' | 'passphrase'> = {}
  try {
    if (s.caFile) tls.ca = readFileSync(s.caFile)
    if (s.clientPfxFile) {
      tls.pfx = readFileSync(s.clientPfxFile)
      if (s.certPassphrase) tls.passphrase = s.certPassphrase
    } else if (s.clientCertFile && s.clientKeyFile) {
      tls.cert = readFileSync(s.clientCertFile)
      tls.key = readFileSync(s.clientKeyFile)
      if (s.certPassphrase) tls.passphrase = s.certPassphrase
    }
  } catch (e) {
    return Promise.reject(new Error(`Could not read certificate file: ${(e as Error).message}`))
  }

  const follow = (url: string, method: string, body: string | undefined, hops: number): Promise<RawResponse> =>
    new Promise((resolve, reject) => {
      const parsed = new URL(url)
      const isHttps = parsed.protocol === 'https:'
      const requester = isHttps ? httpsRequest : httpRequest
      const options: RequestOptions = {
        method,
        headers: built.headers,
        signal: controller.signal as never,
        ...(isHttps
          ? { ...tls, rejectUnauthorized: s.sslVerify && !hostExcepted(s, parsed.hostname) }
          : {})
      }
      const req = requester(url, options, (res) => {
        const status = res.statusCode ?? 0
        const location = res.headers.location
        if (s.followRedirects && location && status >= 300 && status < 400 && hops < s.maxRedirects) {
          res.resume()
          const nextUrl = new URL(location, url).toString()
          const nextMethod = status === 303 ? 'GET' : method
          resolve(follow(nextUrl, nextMethod, status === 303 ? undefined : body, hops + 1))
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const headers: Record<string, string> = {}
          const setCookies: string[] = []
          for (const [name, value] of Object.entries(res.headers)) {
            if (name.toLowerCase() === 'set-cookie' && Array.isArray(value)) {
              setCookies.push(...value)
              headers[name] = value.join(', ')
            } else if (value !== undefined) {
              headers[name] = Array.isArray(value) ? value.join(', ') : String(value)
            }
          }
          if (loadSettings().cookieJarEnabled) storeCookies(url, setCookies)
          resolve({
            status,
            statusText: res.statusMessage ?? '',
            headers,
            body: Buffer.concat(chunks).toString('utf8'),
            timeMs: Date.now() - started
          })
        })
      })
      req.on('error', reject)
      if (body) req.write(body)
      req.end()
    })

  return follow(built.url, built.method, built.body, 0)
}

export async function sendHttp(
  built: BuiltRequest,
  timeoutMs = 30000,
  cancelKey?: string
): Promise<RawResponse> {
  const s = loadSettings()
  const controller = new AbortController()
  if (cancelKey) inFlight.set(cancelKey, controller)
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()

  // Attach jarred cookies unless the request sets its own Cookie header.
  if (s.cookieJarEnabled && !Object.keys(built.headers).some((h) => h.toLowerCase() === 'cookie')) {
    const cookie = cookieHeaderFor(built.url)
    if (cookie) built = { ...built, headers: { ...built.headers, Cookie: cookie } }
  }

  try {
    if (tlsConfigured(s)) {
      return await sendViaNode(built, controller)
    }
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
    if (s.cookieJarEnabled) {
      const fetchHeaders = res.headers as Headers & { getSetCookie?: () => string[] }
      const setCookies = fetchHeaders.getSetCookie?.() ?? (headers['set-cookie'] ? [headers['set-cookie']] : [])
      storeCookies(built.url, setCookies)
    }
    return {
      status: res.status,
      statusText: res.statusText,
      headers,
      body,
      timeMs: Date.now() - started
    }
  } finally {
    clearTimeout(timer)
    // Only remove our own entry: a newer send may have reused the key.
    if (cancelKey && inFlight.get(cancelKey) === controller) inFlight.delete(cancelKey)
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

import { isNewerVersion, type UpdateInfo } from '../core/version'

const UPDATE_MANIFEST = 'https://tiger.62-238-17-135.sslip.io/version.json'

/**
 * Fetch the published version manifest and report an update when it is newer
 * than the running app. Returns null on any failure: the check must never
 * disturb startup.
 */
export async function checkForUpdate(currentVersion: string): Promise<UpdateInfo | null> {
  try {
    const res = await net.fetch(UPDATE_MANIFEST, { cache: 'no-store' })
    if (!res.ok) return null
    const manifest = (await res.json()) as { version?: unknown; url?: unknown; notes?: unknown }
    if (typeof manifest.version !== 'string') return null
    if (!isNewerVersion(manifest.version, currentVersion)) return null
    const url =
      typeof manifest.url === 'string' && /^https?:\/\//.test(manifest.url)
        ? manifest.url
        : 'https://tiger.62-238-17-135.sslip.io/#download'
    return {
      latest: manifest.version,
      url,
      notes: Array.isArray(manifest.notes) ? manifest.notes.map(String) : []
    }
  } catch {
    return null
  }
}

/**
 * Tiger's own GA4 Measurement Protocol credentials. Filled at release time;
 * while empty, analytics is a no-op regardless of the settings toggle.
 */
const APP_GA4 = {
  measurementId: '',
  apiSecret: ''
}

/** Fire an analytics event, but only when enabled and credentials exist. */
export async function track(event: AnalyticsEvent): Promise<void> {
  const s = loadSettings()
  // Credentials are a PAIR bound to one GA4 stream; never mix sources.
  const userPair = s.measurementId && s.apiSecret
  const measurementId = userPair ? s.measurementId! : APP_GA4.measurementId
  const apiSecret = userPair ? s.apiSecret! : APP_GA4.apiSecret
  if (!s.analyticsEnabled || !measurementId || !apiSecret) return
  try {
    await net.fetch(measurementEndpoint(measurementId, apiSecret), {
      method: 'POST',
      body: JSON.stringify(buildMeasurementPayload(s.clientId, [event]))
    })
  } catch {
    // Analytics must never disrupt the app.
  }
}
