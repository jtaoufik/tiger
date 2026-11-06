/**
 * WebSocket and Server-Sent Events connections. The main process owns them:
 * the renderer asks to open, send and close (IPC in ./index.ts), and gets
 * every event back in order. Variables are interpolated here, and the
 * network settings apply as for HTTP: the proxy (Tiger's own or the
 * system's), Verify SSL and its host exceptions, a custom CA and client
 * certificates.
 *
 * - WebSocket: the `ws` package. Its handshake goes through the proxy the
 *   request session resolves for the URL (an HTTP CONNECT tunnel).
 * - SSE: a streaming fetch through Chromium's network stack, or through
 *   node:https when certificate files are imported (as HTTP does).
 */

import { connect as netConnect, type Socket } from 'node:net'
import { connect as tlsConnect, type TLSSocket } from 'node:tls'
import { request as httpRequest, type IncomingMessage } from 'node:http'
import { request as httpsRequest } from 'node:https'
import WebSocket from 'ws'
import {
  buildRealtimeTarget,
  createSseParser,
  handshakeUrl,
  messageSize,
  parsePacProxy,
  SSE_DEFAULT_RETRY_MS,
  type RealtimeEvent,
  type RealtimeOpenSpec,
  type RealtimeTarget
} from '../core/realtime'
import { hostExcepted, readTlsFiles, requestSession, tlsConfigured, type TlsFiles } from './http'
import { isE2E, isLoopbackOrLocal } from './e2eGuard'
import { loadSettings } from './settings'
import { mainT } from './i18n'
import { interpolate, type VarMap } from '../core/interpolate'

type Settings = ReturnType<typeof loadSettings>
export type RealtimeEmit = (ev: RealtimeEvent) => void

interface Connection {
  closed: boolean
  reconnect: boolean
  /** The variables of the environment the connection was opened with. */
  vars: VarMap
  emit: RealtimeEmit
  send?: (text: string) => boolean
  /** Stop everything: the socket, the stream, a pending reconnect. */
  stop: () => void
}

const connections = new Map<string, Connection>()

/** Open a connection; an open one with the same id is closed first. */
export async function openRealtime(spec: RealtimeOpenSpec, emit: RealtimeEmit): Promise<void> {
  closeRealtime(spec.id)
  const conn: Connection = {
    closed: false,
    reconnect: spec.request.kind === 'sse' && spec.request.reconnect === true,
    vars: spec.vars ?? {},
    emit,
    stop: () => undefined
  }
  connections.set(spec.id, conn)
  let target: RealtimeTarget
  try {
    target = buildRealtimeTarget(spec.request, spec.vars)
    const protocol = new URL(target.url).protocol
    const allowed = target.kind === 'ws' ? ['ws:', 'wss:'] : ['http:', 'https:']
    if (!allowed.includes(protocol)) throw new Error(mainT('main.realtime.badUrl', { url: target.url }))
  } catch (e) {
    finish(spec.id, conn, { error: errorText(e, '') })
    return
  }
  if (target.kind === 'ws') await openWebSocket(spec.id, conn, target)
  else void runEventSource(spec.id, conn, target)
}

/**
 * Send a text message on an open WebSocket, its {{variables}} filled in from
 * the connection's environment. False when there is no open socket.
 */
export function sendRealtime(id: string, text: string): boolean {
  const conn = connections.get(id)
  if (!conn?.send) return false
  return conn.send(interpolate(text, conn.vars))
}

/** Close a connection (and stop SSE reconnecting). False when none is open. */
export function closeRealtime(id: string): boolean {
  const conn = connections.get(id)
  if (!conn) return false
  conn.closed = true
  conn.stop()
  return true
}

/** Turn SSE auto-reconnect on or off for a live connection. */
export function setRealtimeReconnect(id: string, on: boolean): void {
  const conn = connections.get(id)
  if (conn) conn.reconnect = on
}

/** Close every connection (window closed, app quitting). */
export function closeAllRealtime(): void {
  for (const id of [...connections.keys()]) closeRealtime(id)
}

/** Ids of the live connections, for tests. */
export function liveRealtimeIds(): string[] {
  return [...connections.keys()]
}

/**
 * Report the end and forget the connection. Silent when a newer connection
 * took the id (Connect again while open): its events are the ones that count.
 */
function finish(id: string, conn: Connection, end: { error?: string; code?: number; reason?: string }): void {
  conn.closed = true
  if (connections.get(id) !== conn) return
  connections.delete(id)
  if (end.error) conn.emit({ id, type: 'error', at: Date.now(), message: end.error })
  conn.emit({
    id,
    type: 'close',
    at: Date.now(),
    ...(end.code !== undefined ? { code: end.code } : {}),
    ...(end.reason ? { reason: end.reason } : {})
  })
}

function errorText(e: unknown, url: string): string {
  const message = e instanceof Error ? e.message : String(e)
  const code = (e as { code?: string })?.code
  if (code === 'ECONNREFUSED') return mainT('main.realtime.refused', { url })
  return message || String(code ?? '')
}

function blocked(url: string): boolean {
  // Same hermetic rule as HTTP sends in end-to-end runs.
  return isE2E() && !isLoopbackOrLocal(url)
}

/** The TLS options Node needs for this host under the settings. */
function tlsOptions(s: Settings, hostname: string): TlsFiles & { rejectUnauthorized: boolean } {
  return {
    ...(tlsConfigured(s) ? readTlsFiles(s) : {}),
    rejectUnauthorized: s.sslVerify && !hostExcepted(s, hostname)
  }
}

/** The proxy the request session uses for `url` (Tiger's setting, else the system's). */
async function proxyFor(url: string): Promise<{ host: string; port: number; secure: boolean } | null> {
  try {
    const ses = requestSession()
    await ses.ready
    return parsePacProxy(await ses.session.resolveProxy(handshakeUrl(url)))
  } catch {
    return null
  }
}

/**
 * A socket tunneled to host:port through an HTTP proxy (CONNECT), with the
 * proxy credentials from the settings when there are some.
 */
function connectTunnel(
  proxy: { host: string; port: number; secure: boolean },
  host: string,
  port: number,
  s: Settings,
  timeoutMs: number
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket: Socket = proxy.secure
      ? tlsConnect({ host: proxy.host, port: proxy.port, servername: proxy.host })
      : netConnect(proxy.port, proxy.host)
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error(mainT('main.realtime.proxyTimeout')))
    }, timeoutMs)
    const authority = `${host.includes(':') ? `[${host}]` : host}:${port}`
    const auth = s.proxyUsername
      ? `Proxy-Authorization: Basic ${Buffer.from(`${s.proxyUsername}:${s.proxyPassword}`).toString('base64')}\r\n`
      : ''
    socket.once(proxy.secure ? 'secureConnect' : 'connect', () => {
      socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n${auth}\r\n`)
    })
    let head = Buffer.alloc(0)
    const onData = (chunk: Buffer): void => {
      head = Buffer.concat([head, chunk])
      const end = head.indexOf('\r\n\r\n')
      if (end === -1) return
      socket.off('data', onData)
      clearTimeout(timer)
      const status = Number(/^HTTP\/1\.[01] (\d{3})/.exec(head.subarray(0, end).toString('latin1'))?.[1])
      if (status !== 200) {
        socket.destroy()
        return reject(new Error(mainT('main.realtime.proxyRefused', { status: String(status || '?') })))
      }
      const rest = head.subarray(end + 4)
      if (rest.length) socket.unshift(rest)
      resolve(socket)
    }
    socket.on('data', onData)
    socket.once('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
  })
}

async function openWebSocket(id: string, conn: Connection, target: RealtimeTarget): Promise<void> {
  const s = loadSettings()
  conn.emit({ id, type: 'connecting', at: Date.now(), url: target.url, attempt: 0 })
  if (blocked(target.url)) return finish(id, conn, { error: 'net::ERR_BLOCKED_BY_CLIENT' })
  const url = new URL(target.url)
  const secure = url.protocol === 'wss:'
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const port = Number(url.port) || (secure ? 443 : 80)
  let tls: ReturnType<typeof tlsOptions>
  try {
    tls = secure ? tlsOptions(s, hostname) : { rejectUnauthorized: true }
  } catch (e) {
    return finish(id, conn, { error: errorText(e, target.url) })
  }

  // A tunnel through the proxy, when the session resolves one for this URL.
  let tunnel: Socket | undefined
  const proxy = await proxyFor(target.url)
  if (conn.closed) return finish(id, conn, {})
  if (proxy) {
    try {
      tunnel = await connectTunnel(proxy, hostname, port, s, s.timeoutMs || 30000)
    } catch (e) {
      return finish(id, conn, { error: errorText(e, target.url) })
    }
    if (conn.closed) {
      tunnel.destroy()
      return finish(id, conn, {})
    }
  }

  let socket: WebSocket
  try {
    socket = new WebSocket(target.url, target.protocols, {
      headers: target.headers,
      handshakeTimeout: s.timeoutMs || 30000,
      ...(secure ? tls : {}),
      ...(tunnel
        ? {
            createConnection: (): Socket | TLSSocket =>
              secure
                ? tlsConnect({ socket: tunnel, servername: hostname, ...tls })
                : (tunnel as Socket)
          }
        : {})
    })
  } catch (e) {
    tunnel?.destroy()
    return finish(id, conn, { error: errorText(e, target.url) })
  }

  let failure: string | undefined
  let ended = false
  const end = (how: { error?: string; code?: number; reason?: string }): void => {
    if (ended) return
    ended = true
    finish(id, conn, how)
  }
  conn.stop = () => {
    if (socket.readyState === WebSocket.CONNECTING) socket.terminate()
    else if (socket.readyState === WebSocket.OPEN) socket.close(1000)
  }
  conn.send = (text) => {
    if (socket.readyState !== WebSocket.OPEN) return false
    socket.send(text)
    conn.emit({ id, type: 'sent', at: Date.now(), data: text, size: messageSize(text) })
    return true
  }
  socket.on('open', () => {
    conn.emit({ id, type: 'open', at: Date.now(), ...(socket.protocol ? { protocol: socket.protocol } : {}) })
  })
  socket.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
    const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer)
    conn.emit({
      id,
      type: 'message',
      at: Date.now(),
      // Binary frames travel as base64 so nothing is lost; the timeline says so.
      data: isBinary ? buf.toString('base64') : buf.toString('utf8'),
      size: buf.length,
      ...(isBinary ? { binary: true } : {})
    })
  })
  socket.on('unexpected-response', (req, res: IncomingMessage) => {
    failure = mainT('main.realtime.handshakeStatus', {
      status: `${res.statusCode ?? ''} ${res.statusMessage ?? ''}`.trim()
    })
    req.destroy()
    res.resume()
    end({ error: failure })
  })
  socket.on('error', (e) => {
    // Closing while the handshake runs is not a failure worth showing.
    if (!conn.closed) failure = failure ?? errorText(e, target.url)
  })
  socket.on('close', (code: number, reason: Buffer) => {
    end({ ...(failure ? { error: failure } : {}), code, reason: reason.toString('utf8') })
  })
}

/** Abortable wait; resolves early when the signal fires. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
  })
}

interface StreamResponse {
  status: number
  statusText: string
  contentType: string
  body: AsyncIterable<Uint8Array>
}

/** The event stream through Chromium (proxy, system certificates, Verify SSL). */
async function chromiumStream(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<StreamResponse> {
  const ses = requestSession()
  await ses.ready
  const res = await ses.session.fetch(url, { headers, signal, cache: 'no-store' })
  const reader = res.body?.getReader()
  return {
    status: res.status,
    statusText: res.statusText,
    contentType: res.headers.get('content-type') ?? '',
    body: {
      async *[Symbol.asyncIterator]() {
        if (!reader) return
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) return
            if (value) yield value
          }
        } finally {
          reader.releaseLock()
        }
      }
    }
  }
}

/** The event stream through node:http(s), so imported certificates work. */
function nodeStream(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
  s: Settings
): Promise<StreamResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const isHttps = parsed.protocol === 'https:'
    const req = (isHttps ? httpsRequest : httpRequest)(
      url,
      {
        method: 'GET',
        headers,
        signal: signal as never,
        ...(isHttps ? tlsOptions(s, parsed.hostname) : {})
      },
      (res) => {
        resolve({
          status: res.statusCode ?? 0,
          statusText: res.statusMessage ?? '',
          contentType: String(res.headers['content-type'] ?? ''),
          body: res
        })
      }
    )
    req.on('error', reject)
    req.end()
  })
}

/**
 * Read an event stream until it ends or the connection is closed, then
 * reconnect while auto-reconnect is on: after the server's `retry:` (3 s by
 * default), sending Last-Event-ID so the server can resume. An answer that
 * is not a 200 event stream ends it for good, as in a browser's EventSource.
 */
async function runEventSource(id: string, conn: Connection, target: RealtimeTarget): Promise<void> {
  const s = loadSettings()
  let retryMs = SSE_DEFAULT_RETRY_MS
  let lastEventId: string | undefined
  let controller = new AbortController()
  conn.stop = () => controller.abort()
  for (let attempt = 0; ; attempt++) {
    conn.emit({ id, type: 'connecting', at: Date.now(), url: target.url, attempt })
    if (blocked(target.url)) return finish(id, conn, { error: 'net::ERR_BLOCKED_BY_CLIENT' })
    const headers = { ...target.headers, ...(lastEventId !== undefined ? { 'Last-Event-ID': lastEventId } : {}) }
    let failure: string | undefined
    let fatal = false
    try {
      const res = tlsConfigured(s)
        ? await nodeStream(target.url, headers, controller.signal, s)
        : await chromiumStream(target.url, headers, controller.signal)
      if (res.status !== 200) {
        fatal = true
        failure = mainT('main.realtime.sseStatus', { status: `${res.status} ${res.statusText}`.trim() })
      } else if (!/^text\/event-stream\b/i.test(res.contentType)) {
        fatal = true
        failure = mainT('main.realtime.sseType', { type: res.contentType || '?' })
      } else {
        conn.emit({ id, type: 'open', at: Date.now(), status: res.status })
        const parser = createSseParser()
        const decoder = new TextDecoder()
        const deliver = (events: ReturnType<typeof parser.push>): void => {
          for (const ev of events) {
            if (ev.retry !== undefined) retryMs = ev.retry
            if (ev.id !== undefined) lastEventId = ev.id
            if (!ev.event) continue
            conn.emit({
              id,
              type: 'message',
              at: Date.now(),
              data: ev.data,
              size: messageSize(ev.data),
              event: ev.event,
              ...(ev.id !== undefined ? { eventId: ev.id } : {})
            })
          }
        }
        for await (const chunk of res.body) {
          deliver(parser.push(decoder.decode(chunk, { stream: true })))
        }
        deliver(parser.push(decoder.decode()))
        deliver(parser.end())
      }
    } catch (e) {
      if (!conn.closed) failure = errorText(e, target.url)
    }
    if (conn.closed) return finish(id, conn, {})
    if (fatal || !conn.reconnect) return finish(id, conn, failure ? { error: failure } : {})
    if (failure) conn.emit({ id, type: 'error', at: Date.now(), message: failure })
    conn.emit({ id, type: 'reconnecting', at: Date.now(), delayMs: retryMs })
    await wait(retryMs, controller.signal)
    if (conn.closed) return finish(id, conn, {})
    controller = new AbortController()
  }
}
