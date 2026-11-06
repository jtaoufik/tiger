// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { connect as netConnect, createServer as createTcpServer, type Server as TcpServer, type Socket } from 'node:net'
import type { AddressInfo } from 'node:net'
import { WebSocketServer } from 'ws'
import type { RealtimeEvent } from '../../src/core/realtime'
import type { TigerRequest } from '../../src/core/types'

// The realtime connections with Electron stubbed: the request session's
// fetch is Node's own (it streams like net.fetch), and its proxy lookup is
// whatever the test sets. Everything else is real: a WebSocket echo server,
// an SSE server and an HTTP CONNECT proxy, all on loopback.
const proxy = vi.hoisted(() => ({ answer: 'DIRECT' }))
vi.mock('electron', () => ({
  net: { request: () => { throw new Error('not used') }, fetch: () => { throw new Error('not used') } },
  session: {
    defaultSession: {},
    fromPartition: () => ({
      fetch: (url: string, init: RequestInit) => fetch(url, init),
      resolveProxy: async () => proxy.answer,
      setProxy: async () => undefined,
      setCertificateVerifyProc: () => undefined,
      webRequest: { onBeforeRequest: () => undefined }
    })
  }
}))
const settings = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('../../src/main/settings', () => ({ loadSettings: () => settings.value }))
vi.mock('../../src/main/cookieJar', () => ({
  attachCookieStore: async () => undefined,
  cookiesSettled: async () => undefined,
  cookieHeaderFor: async () => '',
  storeCookies: async () => undefined
}))

import { closeAllRealtime, closeRealtime, liveRealtimeIds, openRealtime, sendRealtime, setRealtimeReconnect } from '../../src/main/realtime'

const defaults = {
  timeoutMs: 5000,
  sslVerify: true,
  certExceptions: '',
  caFile: '',
  clientPfxFile: '',
  clientCertFile: '',
  clientKeyFile: '',
  certPassphrase: '',
  proxyUsername: '',
  proxyPassword: ''
}

let http: Server
let wss: WebSocketServer
let base = ''
let wsBase = ''
/** Handshake headers each WebSocket upgrade arrived with. */
const upgrades: IncomingMessage['headers'][] = []
/** SSE requests: their headers, and a way to end the stream from the test. */
const sseHits: Array<{ headers: IncomingMessage['headers']; res: ServerResponse }> = []

beforeAll(async () => {
  wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => (protocols.has('echo.v2') ? 'echo.v2' : false)
  })
  wss.on('connection', (socket) => {
    socket.on('message', (data, isBinary) => {
      const text = data.toString()
      if (text === 'binary please') return socket.send(Buffer.from([0, 1, 2, 255]))
      if (text === 'close please') return socket.close(4001, 'asked to')
      socket.send(isBinary ? data : `echo: ${text}`)
    })
  })
  http = createServer((req, res) => {
    if (req.url?.startsWith('/events')) {
      sseHits.push({ headers: req.headers, res })
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
      const n = sseHits.length
      res.write(`retry: 50\nid: ${n}\nevent: tick\ndata: first ${n}\n\n`)
      res.write(`data: line one\ndata: line two\n\n`)
      if (req.url.includes('end')) res.end()
      return
    }
    if (req.url === '/not-a-stream') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end('{}')
    }
    res.writeHead(404)
    res.end()
  })
  http.on('upgrade', (req, socket, head) => {
    upgrades.push(req.headers)
    if (req.url === '/denied') {
      socket.end('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n')
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  })
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r))
  const port = (http.address() as AddressInfo).port
  base = `http://127.0.0.1:${port}`
  wsBase = `ws://127.0.0.1:${port}`
})

afterAll(async () => {
  closeAllRealtime()
  wss.close()
  for (const hit of sseHits) hit.res.destroy()
  await new Promise<void>((r) => http.close(() => r()))
})

beforeEach(() => {
  settings.value = { ...defaults }
  proxy.answer = 'DIRECT'
  upgrades.length = 0
  sseHits.length = 0
})

afterEach(() => {
  closeAllRealtime()
  delete process.env.TIGER_E2E
})

function request(partial: Partial<TigerRequest>): TigerRequest {
  return {
    kind: 'ws',
    name: 'r',
    method: 'get',
    url: '',
    query: [],
    headers: [],
    body: { type: 'none', content: '' },
    ...partial
  }
}

/** Open a connection and collect what it reports. */
function track() {
  const events: RealtimeEvent[] = []
  const until = async (pred: (evs: RealtimeEvent[]) => boolean, ms = 4000): Promise<void> => {
    const start = Date.now()
    while (!pred(events)) {
      if (Date.now() - start > ms) throw new Error(`timed out; got ${JSON.stringify(events.map((e) => e.type))}`)
      await new Promise((r) => setTimeout(r, 10))
    }
  }
  return { events, emit: (ev: RealtimeEvent) => events.push(ev), until }
}

const ofType = <T extends RealtimeEvent['type']>(evs: RealtimeEvent[], type: T) =>
  evs.filter((e): e is Extract<RealtimeEvent, { type: T }> => e.type === type)

describe('WebSocket connections', () => {
  it('connects with interpolated URL, headers and subprotocol, sends and receives the echo', async () => {
    const c = track()
    await openRealtime(
      {
        id: 'ws1',
        request: request({
          url: '{{wsBase}}/chat',
          query: [{ name: 'room', value: '{{room}}', enabled: true }],
          headers: [{ name: 'X-Token', value: '{{token}}', enabled: true }],
          subprotocols: ['echo.v2'],
          messages: []
        }),
        vars: { wsBase, room: 'blue', token: 't-1', who: 'Ada' }
      },
      c.emit
    )
    await c.until((evs) => evs.some((e) => e.type === 'open'))
    expect(ofType(c.events, 'open')[0].protocol).toBe('echo.v2')
    expect(upgrades[0]['x-token']).toBe('t-1')
    expect(ofType(c.events, 'connecting')[0].url).toBe(`${wsBase}/chat?room=blue`)

    expect(sendRealtime('ws1', 'hello {{who}}')).toBe(true)
    await c.until((evs) => evs.some((e) => e.type === 'message'))
    expect(ofType(c.events, 'sent')[0]).toMatchObject({ data: 'hello Ada', size: 9 })
    expect(ofType(c.events, 'message')[0]).toMatchObject({ data: 'echo: hello Ada', size: 15 })

    expect(closeRealtime('ws1')).toBe(true)
    await c.until((evs) => evs.some((e) => e.type === 'close'))
    expect(ofType(c.events, 'close')[0].code).toBe(1000)
    expect(ofType(c.events, 'error')).toEqual([])
    expect(liveRealtimeIds()).not.toContain('ws1')
    expect(sendRealtime('ws1', 'late')).toBe(false)
  })

  it('reports binary frames as base64 and the close code the server picks', async () => {
    const c = track()
    await openRealtime({ id: 'ws2', request: request({ url: `${wsBase}/x` }), vars: {} }, c.emit)
    await c.until((evs) => evs.some((e) => e.type === 'open'))
    sendRealtime('ws2', 'binary please')
    await c.until((evs) => ofType(evs, 'message').length === 1)
    expect(ofType(c.events, 'message')[0]).toMatchObject({ binary: true, data: 'AAEC/w==', size: 4 })
    sendRealtime('ws2', 'close please')
    await c.until((evs) => evs.some((e) => e.type === 'close'))
    expect(ofType(c.events, 'close')[0]).toMatchObject({ code: 4001, reason: 'asked to' })
  })

  it('says what the server answered when it refuses the upgrade', async () => {
    const c = track()
    await openRealtime({ id: 'ws3', request: request({ url: `${wsBase}/denied` }), vars: {} }, c.emit)
    await c.until((evs) => evs.some((e) => e.type === 'close'))
    expect(ofType(c.events, 'error')[0].message).toContain('401')
    expect(ofType(c.events, 'close')).toHaveLength(1)
  })

  it('refuses an address that is not ws:// or wss://', async () => {
    const c = track()
    await openRealtime({ id: 'ws4', request: request({ url: 'ftp://127.0.0.1/x' }), vars: {} }, c.emit)
    expect(c.events.map((e) => e.type)).toEqual(['error', 'close'])
  })

  it('tunnels through the proxy the session resolves, with its credentials', async () => {
    const seen: string[] = []
    const proxyServer: TcpServer = createTcpServer((client: Socket) => {
      client.once('data', (chunk) => {
        const head = chunk.toString('latin1')
        seen.push(head)
        const [, hostPort] = /^CONNECT (\S+) /.exec(head) ?? []
        const [host, port] = hostPort.split(':')
        const upstream = netConnect(Number(port), host, () => {
          client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
          upstream.pipe(client)
          client.pipe(upstream)
        })
        upstream.on('error', () => client.destroy())
      })
    })
    await new Promise<void>((r) => proxyServer.listen(0, '127.0.0.1', r))
    try {
      proxy.answer = `PROXY 127.0.0.1:${(proxyServer.address() as AddressInfo).port}`
      settings.value = { ...defaults, proxyUsername: 'u', proxyPassword: 'p' }
      const c = track()
      await openRealtime({ id: 'ws5', request: request({ url: `${wsBase}/via-proxy` }), vars: {} }, c.emit)
      await c.until((evs) => evs.some((e) => e.type === 'open'))
      sendRealtime('ws5', 'through')
      await c.until((evs) => evs.some((e) => e.type === 'message'))
      expect(ofType(c.events, 'message')[0].data).toBe('echo: through')
      expect(seen[0]).toMatch(/^CONNECT 127\.0\.0\.1:\d+ HTTP\/1\.1/)
      expect(seen[0]).toContain(`Proxy-Authorization: Basic ${Buffer.from('u:p').toString('base64')}`)
    } finally {
      closeAllRealtime()
      await new Promise<void>((r) => proxyServer.close(() => r()))
    }
  })

  it('stays on loopback in end-to-end runs', async () => {
    process.env.TIGER_E2E = '1'
    const c = track()
    await openRealtime({ id: 'ws6', request: request({ url: 'wss://example.com/x' }), vars: {} }, c.emit)
    expect(ofType(c.events, 'error')[0].message).toBe('net::ERR_BLOCKED_BY_CLIENT')
  })
})

describe('Server-Sent Events connections', () => {
  const sse = (partial: Partial<TigerRequest>) => request({ kind: 'sse', ...partial })

  it('streams named events and multi-line data, then closes on request', async () => {
    const c = track()
    await openRealtime(
      {
        id: 's1',
        request: sse({ url: '{{base}}/events', headers: [{ name: 'X-Who', value: '{{who}}', enabled: true }] }),
        vars: { base, who: 'Ada' }
      },
      c.emit
    )
    await c.until((evs) => ofType(evs, 'message').length === 2)
    expect(ofType(c.events, 'open')[0].status).toBe(200)
    expect(ofType(c.events, 'message').map((m) => [m.event, m.data, m.eventId])).toEqual([
      ['tick', 'first 1', '1'],
      ['message', 'line one\nline two', '1']
    ])
    expect(sseHits[0].headers).toMatchObject({ accept: 'text/event-stream', 'x-who': 'Ada' })
    closeRealtime('s1')
    await c.until((evs) => evs.some((e) => e.type === 'close'))
    expect(ofType(c.events, 'error')).toEqual([])
  })

  it('reconnects after the server retry with Last-Event-ID while auto-reconnect is on', async () => {
    const c = track()
    await openRealtime({ id: 's2', request: sse({ url: `${base}/events?end=1`, reconnect: true }), vars: {} }, c.emit)
    await c.until((evs) => ofType(evs, 'connecting').length >= 2 && ofType(evs, 'message').length >= 4)
    expect(ofType(c.events, 'reconnecting')[0].delayMs).toBe(50)
    expect(sseHits[0].headers['last-event-id']).toBeUndefined()
    expect(sseHits[1].headers['last-event-id']).toBe('1')
    expect(ofType(c.events, 'connecting')[1].attempt).toBe(1)

    // Turned off while live: the next end is the last.
    setRealtimeReconnect('s2', false)
    await c.until((evs) => evs.some((e) => e.type === 'close'))
    expect(liveRealtimeIds()).not.toContain('s2')
  })

  it('ends without reconnecting when the end of the stream comes with auto-reconnect off', async () => {
    const c = track()
    await openRealtime({ id: 's3', request: sse({ url: `${base}/events?end=1` }), vars: {} }, c.emit)
    await c.until((evs) => evs.some((e) => e.type === 'close'))
    expect(ofType(c.events, 'reconnecting')).toEqual([])
    expect(sseHits).toHaveLength(1)
  })

  it('fails for good on an answer that is not an event stream', async () => {
    const c = track()
    await openRealtime({ id: 's4', request: sse({ url: `${base}/not-a-stream`, reconnect: true }), vars: {} }, c.emit)
    await c.until((evs) => evs.some((e) => e.type === 'close'))
    expect(ofType(c.events, 'error')[0].message).toContain('application/json')
    expect(ofType(c.events, 'reconnecting')).toEqual([])

    const d = track()
    await openRealtime({ id: 's5', request: sse({ url: `${base}/missing`, reconnect: true }), vars: {} }, d.emit)
    await d.until((evs) => evs.some((e) => e.type === 'close'))
    expect(ofType(d.events, 'error')[0].message).toContain('404')
  })
})
