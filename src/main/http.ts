import { net, session, type Session } from 'electron'
import { mainT } from './i18n'
import { isUtf8 } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { request as httpsRequest, type RequestOptions } from 'node:https'
import { STATUS_CODES, request as httpRequest } from 'node:http'
import { promisify } from 'node:util'
import { brotliDecompress, gunzip, inflate, inflateRaw } from 'node:zlib'
import { attachCookieStore, cookieHeaderFor, cookiesSettled, storeCookies } from './cookieJar'
import { isE2E, isLoopbackOrLocal } from './e2eGuard'
import type { BuiltRequest } from '../core/request'
import { assembleMultipart, generateBoundary, type MultipartPart } from '../core/multipart'
import type { RawResponse, ResponseTimings } from '../core/response'
import { interpolate, type VarMap } from '../core/interpolate'
import {
  buildMeasurementPayload,
  measurementEndpoint,
  type AnalyticsEvent
} from '../core/analytics'
import type { TigerAuth } from '../core/types'
import { loadSettings } from './settings'

/** Push proxy + TLS settings into one Chromium session; resolves once the proxy applies. */
function configureSession(ses: Session, s: ReturnType<typeof loadSettings>): Promise<void> {
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
  // Without a proxy of its own, Tiger uses the system's (Windows or macOS
  // settings, PAC, WPAD), as a browser does on a corporate network.
  return ses.setProxy(
    s.proxyEnabled && s.proxyUrl
      ? { mode: 'fixed_servers', proxyRules: s.proxyUrl }
      : { mode: 'system' }
  )
}

/** The session requests go through, and when it is ready (proxy applied, jar filled). */
let requestSes: { session: Session; ready: Promise<unknown> } | null = null

/**
 * The Chromium session every Send goes through. It is not the app's default
 * session: it keeps no HTTP cache (an API client must reach the server every
 * time), and its cookie store holds Tiger's cookie jar and nothing else.
 */
export function requestSession(): { session: Session; ready: Promise<unknown> } {
  if (requestSes) return requestSes
  const ses = session.fromPartition('tiger-requests', { cache: false })
  // Same hermetic rule as the default session in end-to-end runs.
  if (isE2E()) ses.webRequest.onBeforeRequest((details, cb) => cb({ cancel: !isLoopbackOrLocal(details.url) }))
  const proxied = configureSession(ses, loadSettings()).catch(() => undefined)
  requestSes = { session: ses, ready: Promise.all([proxied, attachCookieStore(ses)]) }
  return requestSes
}

/**
 * Push proxy + TLS settings into the Chromium sessions (the app's own and the
 * one that sends requests). Call at startup and whenever advanced settings change.
 */
export function applyNetworkSettings(): void {
  const s = loadSettings()
  void configureSession(session.defaultSession, s)
  if (requestSes) void configureSession(requestSes.session, s)
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
export function tlsConfigured(s: ReturnType<typeof loadSettings>): boolean {
  return !!(s.caFile || s.clientPfxFile || (s.clientCertFile && s.clientKeyFile))
}

/**
 * Request headers Chromium keeps for itself: its net module fails the whole
 * request (net::ERR_INVALID_ARGUMENT) when one is set, or silently replaces
 * it (Sec-Fetch-Site). Node's http client sends them as written.
 */
const CHROMIUM_OWNED = new Set([
  'host',
  'content-length',
  'keep-alive',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'cookie2',
  'set-cookie'
])

/** True when a header of the request needs the Node send path (a Chrome "Copy as cURL" sets several). */
function chromiumRefuses(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((name) => {
    const lower = name.toLowerCase()
    return CHROMIUM_OWNED.has(lower) || lower.startsWith('proxy-') || lower.startsWith('sec-fetch-')
  })
}

/**
 * The Content-Length Node must send. Node writes the one it is given, and
 * adds none for a GET, HEAD or DELETE body (the server then never reads it),
 * so every body gets its length. One the request sets is kept when it matches
 * and corrected when it does not (a wrong length hangs the server or cuts the
 * body); next to Transfer-Encoding it is left out, the body going chunked.
 */
function withBodyLength(headers: Record<string, string>, body: string | Buffer | undefined): Record<string, string> {
  const names = Object.keys(headers)
  const lengthName = names.find((name) => name.toLowerCase() === 'content-length')
  const out = { ...headers }
  if (names.some((name) => name.toLowerCase() === 'transfer-encoding')) {
    if (lengthName) delete out[lengthName]
    return out
  }
  const length = body === undefined ? 0 : Buffer.byteLength(body)
  if (lengthName) out[lengthName] = String(length)
  else if (length) out['Content-Length'] = String(length)
  return out
}

export function hostExcepted(s: ReturnType<typeof loadSettings>, hostname: string): boolean {
  return s.certExceptions
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
    .includes(hostname.toLowerCase())
}

/** Origin = scheme + host + port; cross-origin redirects must shed credentials. */
export function sameOrigin(a: string, b: string): boolean {
  try {
    const ua = new URL(a)
    const ub = new URL(b)
    return ua.protocol === ub.protocol && ua.host === ub.host
  } catch {
    return false
  }
}

/**
 * Compute the headers to send on a redirect hop. When the target is a different
 * origin, drop Authorization and Cookie so credentials never leak across hosts
 * (matches fetch/curl behaviour), and a Host the request set, which names the
 * first server. Header name casing is preserved otherwise.
 */
export function redirectHeaders(
  headers: Record<string, string>,
  fromUrl: string,
  toUrl: string
): Record<string, string> {
  if (sameOrigin(fromUrl, toUrl)) return { ...headers }
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase()
    if (lower === 'authorization' || lower === 'cookie' || lower === 'host') continue
    out[name] = value
  }
  return out
}

/**
 * Redirect method/body semantics matching fetch: 303 always becomes GET and
 * drops the body; 301/302 turn a POST into GET and drop the body; otherwise the
 * method and body are preserved.
 */
export function redirectMethodBody(
  status: number,
  method: string,
  body: string | Buffer | undefined
): { method: string; body: string | Buffer | undefined } {
  if (status === 303) return { method: 'GET', body: undefined }
  if ((status === 301 || status === 302) && method.toUpperCase() === 'POST') {
    return { method: 'GET', body: undefined }
  }
  return { method, body }
}

/** One request and its response; `exchange` decides whether a redirect is followed. */
interface Hop {
  status: number
  statusText: string
  /** Response headers; repeated ones joined with ", ". */
  headers: Record<string, string>
  setCookies: string[]
  /** Where a redirect response points, when it has a Location. */
  location?: string
  body: Buffer
  /** When the response headers arrived (time to first byte). */
  headersAt: number
  /** Socket phases, Node path only (fresh connections). */
  phases?: Pick<ResponseTimings, 'dns' | 'tcp' | 'tls'>
}

function joinHeaders(raw: Record<string, string | string[] | undefined>): {
  headers: Record<string, string>
  setCookies: string[]
} {
  const headers: Record<string, string> = {}
  let setCookies: string[] = []
  for (const [name, value] of Object.entries(raw)) {
    if (value === undefined) continue
    const values = Array.isArray(value) ? value.map(String) : [String(value)]
    if (name.toLowerCase() === 'set-cookie') setCookies = values
    headers[name] = values.join(', ')
  }
  return { headers, setCookies }
}

/** What a cancelled or timed-out send rejects with (the renderer words it). */
function abortError(): Error {
  const error = new Error('This operation was aborted')
  error.name = 'AbortError'
  return error
}

/**
 * One exchange through Chromium's network stack (proxy, system certificates).
 * A redirect is not followed here but returned: `exchange` follows it or not,
 * so Follow redirects off shows the 3xx and Max redirects holds.
 *
 * `jarCookies`: Chromium attaches the jar's cookies and stores the response's
 * (also a redirect's, whose Set-Cookie it never hands over). Otherwise its
 * cookie store is left out: nothing is attached, nothing is kept.
 */
function chromiumHop(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | Buffer | undefined,
  signal: AbortSignal,
  jarCookies: boolean
): Promise<Hop> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError())
    const req = net.request({
      method,
      url,
      session: requestSession().session,
      redirect: 'manual',
      // A Referer the request sets goes out as written; under Chromium's
      // default policy a cross-origin one cancels the request.
      referrerPolicy: 'unsafe-url',
      useSessionCookies: jarCookies
    })
    const onAbort = (): void => {
      req.abort()
      reject(abortError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
    const done = (): void => signal.removeEventListener('abort', onAbort)
    req.on('redirect', (status, _method, location, responseHeaders) => {
      // Not followed by Chromium: aborting here ends this request quietly.
      req.abort()
      done()
      resolve({
        status,
        statusText: STATUS_CODES[status] ?? '',
        ...joinHeaders(responseHeaders),
        location,
        body: Buffer.alloc(0),
        headersAt: Date.now()
      })
    })
    req.on('response', (res) => {
      const headersAt = Date.now()
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        done()
        resolve({
          status: res.statusCode,
          statusText: res.statusMessage,
          ...joinHeaders(res.headers),
          body: Buffer.concat(chunks),
          headersAt
        })
      })
      res.on('error', (e: Error) => {
        done()
        reject(e)
      })
    })
    req.on('error', (e) => {
      done()
      reject(e)
    })
    try {
      for (const [name, value] of Object.entries(headers)) req.setHeader(name, value)
      req.end(body)
    } catch (e) {
      done()
      req.abort()
      reject(e)
    }
  })
}

const gunzipAsync = promisify(gunzip)
const inflateAsync = promisify(inflate)
const inflateRawAsync = promisify(inflateRaw)
const brotliDecompressAsync = promisify(brotliDecompress)

/**
 * Undo the response's Content-Encoding (gzip, deflate, br; the last one
 * applied first), as Chromium does on its own path. A body that does not
 * decode, or uses another coding, is shown as received.
 */
async function decodeBody(body: Buffer, contentEncoding: string | undefined): Promise<Buffer> {
  const codings = (contentEncoding ?? '')
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c && c !== 'identity')
  if (!codings.length || !body.length) return body
  let out = body
  try {
    for (const coding of codings.reverse()) {
      if (coding === 'gzip' || coding === 'x-gzip') out = await gunzipAsync(out)
      // "deflate" is meant to be zlib-wrapped, but some servers send it raw.
      else if (coding === 'deflate') out = await inflateAsync(out).catch(() => inflateRawAsync(out))
      else if (coding === 'br') out = await brotliDecompressAsync(out)
      else return body
    }
    return out
  } catch {
    return body
  }
}

export type TlsFiles = Pick<RequestOptions, 'ca' | 'cert' | 'key' | 'pfx' | 'passphrase'>

/** The imported certificate files, for the Node send path. */
export function readTlsFiles(s: ReturnType<typeof loadSettings>): TlsFiles {
  const tls: TlsFiles = {}
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
    throw new Error(mainT('main.http.certRead', { reason: (e as Error).message }))
  }
  return tls
}

/**
 * One exchange through node:http(s), so imported certificates work: custom CA
 * bundles and client certificates (PEM pair or PFX). Note: this path does not
 * go through the Chromium proxy.
 */
function nodeHop(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | Buffer | undefined,
  signal: AbortSignal,
  tls: TlsFiles,
  s: ReturnType<typeof loadSettings>
): Promise<Hop> {
  return new Promise((resolve, reject) => {
    // Same hermetic rule as Chromium's sessions in end-to-end runs.
    if (isE2E() && !isLoopbackOrLocal(url)) return reject(new Error('net::ERR_BLOCKED_BY_CLIENT'))
    const parsed = new URL(url)
    const isHttps = parsed.protocol === 'https:'
    const requester = isHttps ? httpsRequest : httpRequest
    const options: RequestOptions = {
      method,
      headers: withBodyLength(headers, body),
      signal: signal as never,
      ...(isHttps ? { ...tls, rejectUnauthorized: s.sslVerify && !hostExcepted(s, parsed.hostname) } : {})
    }
    const started = Date.now()
    let dnsAt = 0
    let connectAt = 0
    let tlsAt = 0
    const req = requester(url, options, (res) => {
      const headersAt = Date.now()
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', async () => {
        const location = res.headers.location
        resolve({
          status: res.statusCode ?? 0,
          statusText: res.statusMessage ?? '',
          ...joinHeaders(res.headers),
          ...(location ? { location } : {}),
          body: await decodeBody(Buffer.concat(chunks), res.headers['content-encoding']),
          headersAt,
          phases: {
            ...(dnsAt ? { dns: dnsAt - started } : {}),
            ...(connectAt && dnsAt ? { tcp: connectAt - dnsAt } : {}),
            ...(tlsAt && connectAt ? { tls: tlsAt - connectAt } : {})
          }
        })
      })
      res.on('error', reject)
    })
    req.on('socket', (socket) => {
      socket.on('lookup', () => {
        dnsAt = Date.now()
      })
      socket.on('connect', () => {
        connectAt = Date.now()
      })
      socket.on('secureConnect', () => {
        tlsAt = Date.now()
      })
    })
    req.on('error', (e) => reject(signal.aborted ? abortError() : e))
    // In one piece, so Node sends a Content-Length rather than chunks.
    req.end(body)
  })
}

/** The next URL when `hop` is a redirect to follow under the settings, else null. */
function followTarget(
  hop: Hop,
  url: string,
  s: ReturnType<typeof loadSettings>,
  hops: number
): string | null {
  if (!s.followRedirects || hops >= s.maxRedirects) return null
  if (hop.status < 300 || hop.status >= 400 || !hop.location) return null
  try {
    const next = new URL(hop.location, url)
    return next.protocol === 'http:' || next.protocol === 'https:' ? next.toString() : null
  } catch {
    return null
  }
}

function toRawResponse(hop: Hop, started: number): RawResponse {
  const endAt = Date.now()
  const contentType = Object.entries(hop.headers).find(([name]) => name.toLowerCase() === 'content-type')?.[1] ?? ''
  const isImage = /^image\//i.test(contentType)
  return {
    status: hop.status,
    statusText: hop.statusText,
    headers: hop.headers,
    body: hop.body.toString('utf8'),
    // The text cannot stand for every body: images (preview) and bytes that are
    // not UTF-8 (a PDF, a zip) also travel as base64, so Save writes them exactly.
    ...(isImage || !isUtf8(hop.body) ? { bodyBase64: hop.body.toString('base64') } : {}),
    size: hop.body.length,
    timeMs: endAt - started,
    timings: {
      total: endAt - started,
      waiting: hop.headersAt - started,
      download: endAt - hop.headersAt,
      ...hop.phases
    }
  }
}

/**
 * Send `built` and follow its redirects the way the settings say (Follow
 * redirects, Max redirects), with fetch's method and body rules. A
 * cross-origin hop sheds Authorization and Cookie.
 *
 * Cookies come from Tiger's jar only, and only when it is on: each hop gets
 * the jar's cookies for its own URL (so one set by a redirect reaches the
 * next hop) unless the request writes its own Cookie header, and every
 * response's cookies go into the jar.
 */
async function exchange(
  built: BuiltRequest,
  payload: string | Buffer | undefined,
  s: ReturnType<typeof loadSettings>,
  signal: AbortSignal,
  viaNode: boolean
): Promise<RawResponse> {
  const started = Date.now()
  const tls = viaNode ? readTlsFiles(s) : {}
  // The Chromium session gets its proxy and the jar before its first send.
  if (!viaNode || s.cookieJarEnabled) await requestSession().ready
  if (s.cookieJarEnabled) await cookiesSettled()
  let url = built.url
  let method = built.method
  let headers = built.headers
  let body = payload
  for (let hops = 0; ; hops++) {
    const jar = s.cookieJarEnabled && !Object.keys(headers).some((h) => h.toLowerCase() === 'cookie')
    let hop: Hop
    if (viaNode) {
      const cookie = jar ? await cookieHeaderFor(url) : ''
      hop = await nodeHop(url, method, cookie ? { ...headers, Cookie: cookie } : headers, body, signal, tls, s)
    } else {
      hop = await chromiumHop(url, method, headers, body, signal, jar)
    }
    // When Chromium attached the jar's cookies, it also stored this hop's.
    if (s.cookieJarEnabled && (viaNode || !jar)) await storeCookies(url, hop.setCookies)
    const next = followTarget(hop, url, s, hops)
    if (!next) return toRawResponse(hop, started)
    const sem = redirectMethodBody(hop.status, method, body)
    headers = redirectHeaders(headers, url, next)
    url = next
    method = sem.method
    body = sem.body
  }
}

/**
 * Assemble a multipart body at send time: file rows are read from disk HERE
 * (core stays pure), and the Content-Type carries the generated boundary.
 */
function resolveMultipart(
  built: BuiltRequest
): { headers: Record<string, string>; bodyBytes: Buffer } | null {
  if (!built.multipart?.length) return null
  const parts: MultipartPart[] = built.multipart.map((p) =>
    p.isFile
      ? {
          name: p.name,
          value: new Uint8Array(readFileSync(p.value)),
          fileName: basename(p.value)
        }
      : { name: p.name, value: p.value }
  )
  const { bytes, contentType } = assembleMultipart(parts, generateBoundary())
  const headers = { ...built.headers }
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === 'content-type') delete headers[k]
  }
  headers['Content-Type'] = contentType
  return { headers, bodyBytes: Buffer.from(bytes) }
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

  // multipart/form-data: read file rows and assemble the binary body now.
  let bodyPayload: string | Buffer | undefined = built.body
  const mp = resolveMultipart(built)
  if (mp) {
    built = { ...built, headers: mp.headers }
    bodyPayload = mp.bodyBytes
  }

  try {
    // Imported certificate files need Node's TLS; so do headers Chromium keeps for itself.
    const viaNode = tlsConfigured(s) || chromiumRefuses(built.headers)
    return await exchange(built, bodyPayload, s, controller.signal, viaNode)
  } finally {
    clearTimeout(timer)
    // Only remove our own entry: a newer send may have reused the key.
    if (cancelKey && inFlight.get(cancelKey) === controller) inFlight.delete(cancelKey)
  }
}

type OAuth2 = Extract<TigerAuth, { type: 'oauth2' }>

/**
 * Tokens already obtained, keyed by the resolved token URL, client and scope,
 * so Send, the runner and a load test reuse one token until it expires
 * instead of asking the token endpoint again for every request.
 */
const oauthTokens = new Map<string, { token: string; expiresAt: number }>()

/** Without `expires_in`, a token is reused for five minutes. */
const OAUTH_DEFAULT_TTL_MS = 5 * 60_000
/** Renew this long before the server's expiry, so a token never dies in flight. */
const OAUTH_EXPIRY_MARGIN_MS = 30_000

function oauthKey(auth: OAuth2, vars: VarMap): string {
  return JSON.stringify([
    interpolate(auth.tokenUrl, vars),
    interpolate(auth.clientId, vars),
    interpolate(auth.clientSecret, vars),
    interpolate(auth.scope, vars)
  ])
}

/** Drop a cached token (the API answered 401 with it), so the next send gets a fresh one. */
export function forgetOAuthToken(auth: OAuth2, vars: VarMap): void {
  oauthTokens.delete(oauthKey(auth, vars))
}

/** Client-credentials token exchange, run in main so it bypasses CORS. */
export async function getOAuthToken(auth: OAuth2, vars: VarMap): Promise<string> {
  const key = oauthKey(auth, vars)
  const cached = oauthTokens.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.token

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
  if (!res.ok) throw new Error(mainT('main.http.tokenStatus', { status: res.status }))
  const json = (await res.json()) as { access_token?: string; expires_in?: number | string }
  if (!json.access_token) throw new Error(mainT('main.http.tokenMissing'))
  const seconds = Number(json.expires_in)
  const ttl =
    Number.isFinite(seconds) && seconds > 0
      ? Math.max(0, seconds * 1000 - OAUTH_EXPIRY_MARGIN_MS)
      : OAUTH_DEFAULT_TTL_MS
  if (ttl > 0) oauthTokens.set(key, { token: json.access_token, expiresAt: Date.now() + ttl })
  return json.access_token
}

import { isNewerVersion, type UpdateInfo } from '../core/version'

const UPDATE_MANIFEST = 'https://jtaoufik.github.io/tiger/version.json'

/**
 * Fetch the published version manifest and report an update when it is newer
 * than the running app. Returns null on any failure: the check must never
 * disturb startup.
 */
export async function checkForUpdate(currentVersion: string): Promise<UpdateInfo | null> {
  // Microsoft Store builds are updated by the Store, not by Tiger. Offering a manual
  // "you're out of date, download this exe" path would both violate Store policy and
  // hand the user the wrong (unsigned, non-Store) installer.
  if (process.windowsStore) return null
  try {
    const res = await net.fetch(UPDATE_MANIFEST, { cache: 'no-store' })
    if (!res.ok) return null
    const manifest = (await res.json()) as { version?: unknown; url?: unknown; notes?: unknown }
    if (typeof manifest.version !== 'string') return null
    if (!isNewerVersion(manifest.version, currentVersion)) return null
    const url =
      typeof manifest.url === 'string' && /^https?:\/\//.test(manifest.url)
        ? manifest.url
        : 'https://jtaoufik.github.io/tiger/#download'
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
