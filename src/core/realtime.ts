/**
 * WebSocket and Server-Sent Events: the pieces both processes share. The
 * main process owns the connections (src/main/realtime.ts); this module turns
 * a request into what to dial, parses an event stream, and models the
 * timeline the renderer shows. Pure: no DOM, Node or Electron.
 */

import { buildRequest } from './request'
import type { VarMap } from './interpolate'
import { byteLength } from './response'
import type { TigerRequest } from './types'

export type RealtimeKind = 'ws' | 'sse'

/** What the main process dials: everything interpolated, auth applied. */
export interface RealtimeTarget {
  kind: RealtimeKind
  url: string
  headers: Record<string, string>
  /** WebSocket only. */
  protocols: string[]
}

/**
 * Resolve a WebSocket or SSE request against its variables. A WebSocket URL
 * written with http(s):// (or no scheme, which buildRequest turns into
 * http://) is dialed as ws(s)://, as Postman and Insomnia do.
 */
export function buildRealtimeTarget(req: TigerRequest, vars: VarMap = {}): RealtimeTarget {
  const kind: RealtimeKind = req.kind === 'sse' ? 'sse' : 'ws'
  const built = buildRequest({ ...req, method: 'get', body: { type: 'none', content: '' } }, vars)
  let url = built.url
  const headers = { ...built.headers }
  const has = (name: string): boolean => Object.keys(headers).some((k) => k.toLowerCase() === name)
  if (kind === 'ws') {
    url = url.replace(/^http(s?):\/\//i, (_m, s: string) => `ws${s}://`)
  } else {
    if (!has('accept')) headers.Accept = 'text/event-stream'
    if (!has('cache-control')) headers['Cache-Control'] = 'no-cache'
  }
  const protocols =
    kind === 'ws'
      ? (req.subprotocols ?? []).map((p) => p.trim()).filter(Boolean)
      : []
  return { kind, url, headers, protocols }
}

/** The http(s) URL a ws(s) URL handshakes on, for proxy lookups. */
export function handshakeUrl(url: string): string {
  return url.replace(/^ws(s?):\/\//i, (_m, s: string) => `http${s}://`)
}

/**
 * The first usable proxy in a PAC-style answer ("PROXY host:8080; DIRECT"),
 * as Chromium's resolveProxy returns it; null for DIRECT or a SOCKS-only
 * answer (dialed directly).
 */
export function parsePacProxy(result: string): { host: string; port: number; secure: boolean } | null {
  for (const part of result.split(';')) {
    const [type, hostPort] = part.trim().split(/\s+/)
    if (!type || !hostPort) continue
    const upper = type.toUpperCase()
    if (upper !== 'PROXY' && upper !== 'HTTPS') continue
    const m = /^\[?([^\]]+?)\]?:(\d+)$/.exec(hostPort)
    if (!m) continue
    return { host: m[1], port: Number(m[2]), secure: upper === 'HTTPS' }
  }
  return null
}

/** One event of a text/event-stream. */
export interface SseEvent {
  /** The `event:` field; "message" when the server names none. */
  event: string
  data: string
  /** The last event id seen so far (sent back as Last-Event-ID on reconnect). */
  id?: string
  /** A `retry:` the server asked for, in milliseconds. */
  retry?: number
}

/**
 * An incremental text/event-stream parser, per the WHATWG rules: lines end
 * in CRLF, LF or CR; a blank line dispatches; `data:` lines join with "\n";
 * a line starting with ":" is a comment. Chunks may split anywhere.
 */
export function createSseParser(): { push(chunk: string): SseEvent[]; end(): SseEvent[] } {
  let buffer = ''
  let data: string[] = []
  let event = ''
  let lastId: string | undefined
  let retry: number | undefined
  let started = false

  const dispatch = (out: SseEvent[]): void => {
    if (data.length) {
      out.push({
        event: event || 'message',
        data: data.join('\n'),
        ...(lastId !== undefined ? { id: lastId } : {}),
        ...(retry !== undefined ? { retry } : {})
      })
    } else if (retry !== undefined) {
      // A retry-only block still matters to the reconnect loop.
      out.push({ event: '', data: '', ...(lastId !== undefined ? { id: lastId } : {}), retry })
    }
    data = []
    event = ''
    retry = undefined
  }

  const line = (text: string, out: SseEvent[]): void => {
    if (text === '') return dispatch(out)
    if (text.startsWith(':')) return
    const colon = text.indexOf(':')
    const field = colon === -1 ? text : text.slice(0, colon)
    let value = colon === -1 ? '' : text.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'data') data.push(value)
    else if (field === 'event') event = value
    else if (field === 'id' && !value.includes('\0')) lastId = value
    else if (field === 'retry' && /^\d+$/.test(value)) retry = Number(value)
  }

  const push = (chunk: string): SseEvent[] => {
    const out: SseEvent[] = []
    buffer += chunk
    if (!started && buffer.length) {
      // A UTF-8 byte order mark at the very start is ignored.
      if (buffer.charCodeAt(0) === 0xfeff) buffer = buffer.slice(1)
      started = true
    }
    let start = 0
    for (let i = 0; i < buffer.length; i++) {
      const c = buffer[i]
      if (c !== '\n' && c !== '\r') continue
      // A CR at the very end may be the first half of a CRLF: wait for more.
      if (c === '\r' && i === buffer.length - 1) break
      line(buffer.slice(start, i), out)
      if (c === '\r' && buffer[i + 1] === '\n') i++
      start = i + 1
    }
    buffer = buffer.slice(start)
    return out
  }

  return {
    push,
    /** The stream closed: a trailing lone CR still ends its line; an event without its blank line is dropped. */
    end: () => {
      const out = buffer.endsWith('\r') ? push('\n') : []
      buffer = ''
      data = []
      event = ''
      return out
    }
  }
}

/** Default SSE reconnect delay when the server sends no `retry:`. */
export const SSE_DEFAULT_RETRY_MS = 3000

/** What the main process reports about a connection, in order. */
export type RealtimeEvent =
  | { id: string; type: 'connecting'; at: number; url: string; attempt: number }
  | { id: string; type: 'open'; at: number; protocol?: string; status?: number }
  | { id: string; type: 'message'; at: number; data: string; size: number; binary?: boolean; event?: string; eventId?: string }
  | { id: string; type: 'sent'; at: number; data: string; size: number }
  | { id: string; type: 'error'; at: number; message: string }
  | { id: string; type: 'close'; at: number; code?: number; reason?: string }
  | { id: string; type: 'reconnecting'; at: number; delayMs: number }

/** What the renderer asks main to open. */
export interface RealtimeOpenSpec {
  /** The connection id (the request's id in the renderer). */
  id: string
  request: TigerRequest
  vars: VarMap
}

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'

export type TimelineDirection = 'sent' | 'received' | 'system'

/** One line of the timeline. */
export interface TimelineEntry {
  seq: number
  at: number
  direction: TimelineDirection
  type: RealtimeEvent['type']
  /** The message text; for a system note, the close reason or the error. */
  data: string
  size: number
  /** SSE: the event name when it is not "message". */
  event?: string
  binary?: boolean
  code?: number
  delayMs?: number
  attempt?: number
  url?: string
  protocol?: string
}

/** The renderer's view of one connection. */
export interface ConnectionState {
  status: ConnectionStatus
  entries: TimelineEntry[]
  /** Next entry sequence number. */
  nextSeq: number
}

/** The timeline keeps this many entries; older ones scroll away. */
export const TIMELINE_LIMIT = 2000

export function emptyConnection(): ConnectionState {
  return { status: 'idle', entries: [], nextSeq: 1 }
}

function statusAfter(prev: ConnectionStatus, ev: RealtimeEvent): ConnectionStatus {
  switch (ev.type) {
    case 'connecting':
      return 'connecting'
    case 'open':
      return 'open'
    case 'reconnecting':
      return 'reconnecting'
    case 'close':
      return 'closed'
    default:
      return prev
  }
}

/** Fold one event from main into a connection's state. */
export function applyRealtimeEvent(state: ConnectionState, ev: RealtimeEvent): ConnectionState {
  const base = { seq: state.nextSeq, at: ev.at }
  let entry: TimelineEntry
  switch (ev.type) {
    case 'message':
      entry = {
        ...base,
        direction: 'received',
        type: 'message',
        data: ev.data,
        size: ev.size,
        ...(ev.event && ev.event !== 'message' ? { event: ev.event } : {}),
        ...(ev.binary ? { binary: true } : {})
      }
      break
    case 'sent':
      entry = { ...base, direction: 'sent', type: 'sent', data: ev.data, size: ev.size }
      break
    case 'connecting':
      entry = { ...base, direction: 'system', type: 'connecting', data: '', size: 0, url: ev.url, attempt: ev.attempt }
      break
    case 'open':
      entry = { ...base, direction: 'system', type: 'open', data: '', size: 0, ...(ev.protocol ? { protocol: ev.protocol } : {}) }
      break
    case 'error':
      entry = { ...base, direction: 'system', type: 'error', data: ev.message, size: 0 }
      break
    case 'close':
      entry = {
        ...base,
        direction: 'system',
        type: 'close',
        data: ev.reason ?? '',
        size: 0,
        ...(ev.code !== undefined ? { code: ev.code } : {})
      }
      break
    case 'reconnecting':
      entry = { ...base, direction: 'system', type: 'reconnecting', data: '', size: 0, delayMs: ev.delayMs }
      break
  }
  const entries = state.entries.length >= TIMELINE_LIMIT ? state.entries.slice(-(TIMELINE_LIMIT - 1)) : state.entries.slice()
  entries.push(entry)
  return { status: statusAfter(state.status, ev), entries, nextSeq: state.nextSeq + 1 }
}

export interface TimelineFilter {
  /** Case-insensitive text to find in the message or its SSE event name. */
  query: string
  direction: 'all' | 'sent' | 'received'
}

/** The entries a filter keeps. System notes show only when nothing narrows the view. */
export function filterTimeline(entries: TimelineEntry[], filter: TimelineFilter): TimelineEntry[] {
  const q = filter.query.trim().toLowerCase()
  if (!q && filter.direction === 'all') return entries
  return entries.filter((e) => {
    if (e.direction === 'system') return false
    if (filter.direction !== 'all' && e.direction !== filter.direction) return false
    if (!q) return true
    return e.data.toLowerCase().includes(q) || (e.event ?? '').toLowerCase().includes(q)
  })
}

/** Byte size of a message as it travels (UTF-8). */
export function messageSize(text: string): number {
  return byteLength(text)
}

/** True when a connection can take a message or be closed. */
export function isLive(status: ConnectionStatus): boolean {
  return status === 'open' || status === 'connecting' || status === 'reconnecting'
}
