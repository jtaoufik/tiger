import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parseRequest, serializeRequest } from '../../src/core/tigerFormat'
import {
  applyRealtimeEvent,
  buildRealtimeTarget,
  createSseParser,
  emptyConnection,
  filterTimeline,
  handshakeUrl,
  parsePacProxy,
  TIMELINE_LIMIT,
  type RealtimeEvent
} from '../../src/core/realtime'
import { requestBadge, requestKind, type TigerRequest } from '../../src/core/types'

const WS_FILE = `meta {
  name: Live prices
  seq: 3
}

ws {
  url: wss://{{host}}/prices
}

query {
  symbol: {{symbol}}
}

headers {
  Authorization: Bearer {{token}}
  ~X-Debug: 1
}

subprotocols {
  graphql-transport-ws
  v2.prices
}

message:json:Subscribe {
  {
    "type": "subscribe",
    "symbol": "{{symbol}}"
  }
}

message:text:Ping: keep alive {
  ping
}

message:text {
}

docs {
  Streams prices.
}
`

const SSE_FILE = `meta {
  name: Order events
}

sse {
  url: {{baseUrl}}/events
  reconnect: true
}

headers {
  Accept: text/event-stream
}
`

describe('.tiger WebSocket requests', () => {
  it('reads every part of a ws file', () => {
    const r = parseRequest(WS_FILE)
    expect(r.kind).toBe('ws')
    expect(r.method).toBe('get')
    expect(r.name).toBe('Live prices')
    expect(r.seq).toBe(3)
    expect(r.url).toBe('wss://{{host}}/prices')
    expect(r.query).toEqual([{ name: 'symbol', value: '{{symbol}}', enabled: true }])
    expect(r.headers[1]).toEqual({ name: 'X-Debug', value: '1', enabled: false })
    expect(r.subprotocols).toEqual(['graphql-transport-ws', 'v2.prices'])
    expect(r.messages).toEqual([
      { name: 'Subscribe', format: 'json', content: '{\n  "type": "subscribe",\n  "symbol": "{{symbol}}"\n}' },
      { name: 'Ping: keep alive', format: 'text', content: 'ping' },
      { name: '', format: 'text', content: '' }
    ])
    expect(r.docs).toBe('Streams prices.')
  })

  it('writes a ws file back byte for byte', () => {
    expect(serializeRequest(parseRequest(WS_FILE))).toBe(WS_FILE)
  })

  it('round-trips a request built in the editor', () => {
    const req: TigerRequest = {
      kind: 'ws',
      name: 'Echo',
      method: 'get',
      url: 'ws://localhost:8080',
      query: [],
      headers: [],
      body: { type: 'none', content: '' },
      subprotocols: ['chat'],
      messages: [
        { name: 'Hello', format: 'text', content: 'hello\n  indented line\n}' },
        { name: 'Braces {x} in name', format: 'json', content: '{"a":1}' }
      ]
    }
    const text = serializeRequest(req)
    const back = parseRequest(text)
    // A brace would end the block header: the name keeps the rest.
    expect(back.messages![1].name).toBe('Braces x in name')
    expect({ ...back, messages: back.messages!.slice(0, 1) }).toEqual({
      ...req,
      seq: undefined,
      messages: req.messages!.slice(0, 1)
    })
    expect(serializeRequest(back)).toBe(text)
  })

  it('keeps a ws file without subprotocols or messages minimal', () => {
    const text = serializeRequest({
      kind: 'ws',
      name: 'Bare',
      method: 'get',
      url: 'ws://x',
      query: [],
      headers: [],
      body: { type: 'none', content: '' },
      subprotocols: [],
      messages: []
    })
    expect(text).toBe('meta {\n  name: Bare\n}\n\nws {\n  url: ws://x\n}\n')
    expect(parseRequest(text)).toMatchObject({ kind: 'ws', subprotocols: [], messages: [] })
  })
})

describe('.tiger Server-Sent Events requests', () => {
  it('reads and writes an sse file', () => {
    const r = parseRequest(SSE_FILE)
    expect(r).toMatchObject({ kind: 'sse', method: 'get', url: '{{baseUrl}}/events', reconnect: true })
    expect(r.subprotocols).toBeUndefined()
    expect(serializeRequest(r)).toBe(SSE_FILE)
  })

  it('leaves reconnect out of the file while it is off', () => {
    const r = { ...parseRequest(SSE_FILE), reconnect: false }
    const text = serializeRequest(r)
    expect(text).toContain('sse {\n  url: {{baseUrl}}/events\n}')
    expect(parseRequest(text).reconnect).toBe(false)
  })
})

describe('.tiger HTTP files are unchanged', () => {
  it('parses an HTTP request without any realtime field', () => {
    const r = parseRequest('meta {\n  name: A\n}\n\nget {\n  url: https://a.test\n}\n')
    expect(r).toEqual({
      name: 'A',
      seq: undefined,
      method: 'get',
      url: 'https://a.test',
      headers: [],
      query: [],
      body: { type: 'none', content: '' }
    })
    expect(requestKind(r)).toBe('http')
    expect(requestBadge(r)).toBe('GET')
  })

  it('re-saves every example request byte for byte', () => {
    const files: string[] = []
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) walk(full)
        else if (name.endsWith('.tiger') && name !== 'collection.tiger' && name !== 'folder.tiger' && !full.includes('environments')) files.push(full)
      }
    }
    walk(join(__dirname, '../../examples'))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      const parsed = parseRequest(text)
      expect(parsed.kind, file).toBeUndefined()
      expect(serializeRequest(parseRequest(serializeRequest(parsed))), file).toBe(serializeRequest(parsed))
    }
  })

  it('names WS and SSE in the badge', () => {
    expect(requestBadge({ kind: 'ws', method: 'get' })).toBe('WS')
    expect(requestBadge({ kind: 'sse', method: 'get' })).toBe('SSE')
  })
})

describe('buildRealtimeTarget', () => {
  const base: TigerRequest = {
    kind: 'ws',
    name: 'x',
    method: 'get',
    url: '{{host}}/live',
    query: [{ name: 'room', value: '{{room}}', enabled: true }],
    headers: [{ name: 'X-Token', value: '{{token}}', enabled: true }],
    body: { type: 'json', content: '{"ignored":true}' },
    auth: { type: 'bearer', token: '{{token}}' },
    subprotocols: [' chat ', ''],
    messages: []
  }
  const vars = { host: 'localhost:9000', room: 'a b', token: 's3' }

  it('interpolates, applies auth and query, and dials ws://', () => {
    const target = buildRealtimeTarget(base, vars)
    expect(target).toEqual({
      kind: 'ws',
      url: 'ws://localhost:9000/live?room=a%20b',
      headers: { Authorization: 'Bearer s3', 'X-Token': 's3' },
      protocols: ['chat']
    })
  })

  it('turns https:// into wss:// for a WebSocket', () => {
    expect(buildRealtimeTarget({ ...base, url: 'https://a.test/x', query: [] }, vars).url).toBe('wss://a.test/x')
  })

  it('asks an SSE server for an event stream unless the request says otherwise', () => {
    const sse = buildRealtimeTarget({ ...base, kind: 'sse', url: 'http://a.test/e', query: [] }, vars)
    expect(sse.url).toBe('http://a.test/e')
    expect(sse.headers).toMatchObject({ Accept: 'text/event-stream', 'Cache-Control': 'no-cache' })
    expect(sse.protocols).toEqual([])
    const own = buildRealtimeTarget(
      { ...base, kind: 'sse', url: 'http://a.test/e', headers: [{ name: 'accept', value: '*/*', enabled: true }] },
      vars
    )
    expect(own.headers.accept).toBe('*/*')
    expect(own.headers.Accept).toBeUndefined()
  })
})

describe('proxy answers', () => {
  it('picks the first HTTP proxy', () => {
    expect(parsePacProxy('PROXY proxy.corp:3128; DIRECT')).toEqual({ host: 'proxy.corp', port: 3128, secure: false })
    expect(parsePacProxy('HTTPS [::1]:8443')).toEqual({ host: '::1', port: 8443, secure: true })
    expect(parsePacProxy('SOCKS5 s:1080; PROXY p:80')).toEqual({ host: 'p', port: 80, secure: false })
  })

  it('dials directly otherwise', () => {
    expect(parsePacProxy('DIRECT')).toBeNull()
    expect(parsePacProxy('')).toBeNull()
  })

  it('looks a ws URL up as its http twin', () => {
    expect(handshakeUrl('wss://a.test/x')).toBe('https://a.test/x')
    expect(handshakeUrl('ws://a.test/x')).toBe('http://a.test/x')
  })
})

describe('createSseParser', () => {
  it('parses events, names, ids and retry', () => {
    const p = createSseParser()
    const out = p.push('retry: 1500\nid: 7\nevent: price\ndata: {"a":1}\ndata: second\n\n: comment\ndata: plain\n\n')
    expect(out).toEqual([
      { event: 'price', data: '{"a":1}\nsecond', id: '7', retry: 1500 },
      { event: 'message', data: 'plain', id: '7' }
    ])
  })

  it('handles chunks split anywhere, CRLF and CR line ends', () => {
    const p = createSseParser()
    const stream = '﻿data: one\r\n\r\ndata:two\r\rdata: three\n\n'
    const events = [...stream].flatMap((c) => p.push(c))
    expect(events.map((e) => e.data)).toEqual(['one', 'two', 'three'])
  })

  it('drops an event the stream ended before dispatching', () => {
    const p = createSseParser()
    expect(p.push('data: half')).toEqual([])
    expect(p.end()).toEqual([])
  })

  it('ignores an id with a NUL and keeps fields without a colon', () => {
    const p = createSseParser()
    expect(p.push('id: a\0b\ndata\n\n')).toEqual([{ event: 'message', data: '' }])
  })
})

describe('timeline', () => {
  const id = 'r1'
  const events: RealtimeEvent[] = [
    { id, type: 'connecting', at: 1, url: 'ws://x', attempt: 0 },
    { id, type: 'open', at: 2, protocol: 'chat' },
    { id, type: 'sent', at: 3, data: 'hello', size: 5 },
    { id, type: 'message', at: 4, data: 'HELLO back', size: 10 },
    { id, type: 'message', at: 5, data: 'tick', size: 4, event: 'clock' },
    { id, type: 'close', at: 6, code: 1000, reason: 'bye' }
  ]

  it('folds events into status and entries', () => {
    let state = emptyConnection()
    const statuses: string[] = []
    for (const ev of events) {
      state = applyRealtimeEvent(state, ev)
      statuses.push(state.status)
    }
    expect(statuses).toEqual(['connecting', 'open', 'open', 'open', 'open', 'closed'])
    expect(state.entries.map((e) => [e.seq, e.direction, e.type])).toEqual([
      [1, 'system', 'connecting'],
      [2, 'system', 'open'],
      [3, 'sent', 'sent'],
      [4, 'received', 'message'],
      [5, 'received', 'message'],
      [6, 'system', 'close']
    ])
    expect(state.entries[4].event).toBe('clock')
    expect(state.entries[5]).toMatchObject({ code: 1000, data: 'bye' })
  })

  it('filters by text and direction', () => {
    const state = events.reduce(applyRealtimeEvent, emptyConnection())
    expect(filterTimeline(state.entries, { query: '', direction: 'all' })).toHaveLength(6)
    expect(filterTimeline(state.entries, { query: 'hello', direction: 'all' }).map((e) => e.data)).toEqual([
      'hello',
      'HELLO back'
    ])
    expect(filterTimeline(state.entries, { query: '', direction: 'received' })).toHaveLength(2)
    expect(filterTimeline(state.entries, { query: 'CLOCK', direction: 'received' }).map((e) => e.data)).toEqual(['tick'])
    expect(filterTimeline(state.entries, { query: 'hello', direction: 'sent' })).toHaveLength(1)
  })

  it('keeps at most TIMELINE_LIMIT entries', () => {
    let state = emptyConnection()
    for (let i = 0; i < TIMELINE_LIMIT + 5; i++) {
      state = applyRealtimeEvent(state, { id, type: 'message', at: i, data: String(i), size: 1 })
    }
    expect(state.entries).toHaveLength(TIMELINE_LIMIT)
    expect(state.entries[0].data).toBe('5')
  })
})

describe('exports', () => {
  it('leave WebSocket and SSE requests out of Postman and OpenAPI', async () => {
    const { exportPostman, exportOpenApi } = await import('../../src/core/export')
    const http: TigerRequest = { name: 'h', method: 'get', url: 'https://a.test/x', query: [], headers: [], body: { type: 'none', content: '' } }
    const requests = [
      { path: [], request: http },
      { path: [], request: parseRequest(WS_FILE) },
      { path: [], request: parseRequest(SSE_FILE) }
    ]
    const postman = exportPostman('c', requests) as { item: Array<{ name: string }> }
    expect(postman.item.map((i) => i.name)).toEqual(['h'])
    const openapi = exportOpenApi('c', requests) as { paths: Record<string, unknown> }
    expect(Object.keys(openapi.paths)).toEqual(['/x'])
  })
})
