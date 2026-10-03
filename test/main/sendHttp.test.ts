// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

// sendHttp with Electron stubbed: what reaches a loopback server through the
// Node send path. Chromium's own path (net.request) is checked end to end in
// e2e/, so here it must never be used.
const chromium = vi.hoisted(() => ({ request: vi.fn(() => { throw new Error('the Chromium path was used') }) }))
vi.mock('electron', () => ({
  net: chromium,
  session: { defaultSession: {}, fromPartition: () => { throw new Error('no Chromium session here') } }
}))
const settings = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('../../src/main/settings', () => ({ loadSettings: () => settings.value }))
vi.mock('../../src/main/cookieJar', () => ({
  attachCookieStore: async () => undefined,
  cookiesSettled: async () => undefined,
  cookieHeaderFor: async () => '',
  storeCookies: async () => undefined
}))

import { sendHttp } from '../../src/main/http'

interface Seen {
  method: string
  url: string
  headers: IncomingMessage['headers']
  body: string
}

let server: Server
let base = ''
const seen: Seen[] = []
let route: (req: IncomingMessage, res: ServerResponse, body: Buffer) => boolean = () => false

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body: body.toString('utf8') })
      if (route(req, res, body)) return
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"ok":true}')
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((r) => server.close(() => r())))

const defaults = {
  cookieJarEnabled: false,
  followRedirects: true,
  maxRedirects: 5,
  sslVerify: true,
  certExceptions: '',
  caFile: '',
  clientPfxFile: '',
  clientCertFile: '',
  clientKeyFile: '',
  certPassphrase: ''
}

beforeEach(() => {
  seen.length = 0
  route = () => false
  settings.value = { ...defaults }
  chromium.request.mockClear()
})
afterEach(() => {
  delete process.env.TIGER_E2E
})

describe('headers Chromium keeps for itself', () => {
  it.each([
    ['Host', 'virtual.test'],
    ['Keep-Alive', 'timeout=5'],
    ['TE', 'trailers'],
    ['Upgrade', 'h2c'],
    ['Proxy-Authorization', 'Basic eDp5'],
    ['Sec-Fetch-Mode', 'cors'],
    ['Sec-Fetch-Site', 'same-site'],
    ['Transfer-Encoding', 'chunked']
  ])('%s goes out as written, through Node', async (name, value) => {
    const res = await sendHttp({ method: 'GET', url: `${base}/h`, headers: { [name]: value } })
    expect(res.status).toBe(200)
    expect(seen[0].headers[name.toLowerCase()]).toBe(value)
    expect(chromium.request).not.toHaveBeenCalled()
  })

  it('a Content-Length that matches the body is sent; a wrong one is corrected instead of hanging the server', async () => {
    await sendHttp({ method: 'POST', url: `${base}/len`, headers: { 'Content-Length': '3' }, body: 'abc' })
    await sendHttp({ method: 'POST', url: `${base}/len`, headers: { 'content-length': '999' }, body: 'abcd' })
    await sendHttp({ method: 'GET', url: `${base}/len`, headers: { 'Content-Length': '0' } })
    expect(seen.map((r) => [r.headers['content-length'], r.body])).toEqual([
      ['3', 'abc'],
      ['4', 'abcd'],
      ['0', '']
    ])
  })

  it('next to Transfer-Encoding, a Content-Length is left out (the body goes chunked)', async () => {
    await sendHttp({
      method: 'POST',
      url: `${base}/chunked`,
      headers: { 'Transfer-Encoding': 'chunked', 'Content-Length': '5' },
      body: 'hello'
    })
    expect(seen[0].headers['content-length']).toBeUndefined()
    expect(seen[0].headers['transfer-encoding']).toBe('chunked')
    expect(seen[0].body).toBe('hello')
  })

  it('a body goes out with its Content-Length, not chunked', async () => {
    await sendHttp({ method: 'PUT', url: `${base}/put`, headers: { Host: 'virtual.test' }, body: '{"a":1}' })
    expect(seen[0].headers['content-length']).toBe('7')
    expect(seen[0].headers['transfer-encoding']).toBeUndefined()
  })

  it('in end-to-end runs, the Node path refuses hosts that are not loopback, without connecting', async () => {
    process.env.TIGER_E2E = '1'
    await expect(sendHttp({ method: 'GET', url: 'http://example.invalid/x', headers: { Host: 'a.test' } })).rejects.toThrow(
      /ERR_BLOCKED_BY_CLIENT/
    )
    await expect(sendHttp({ method: 'GET', url: `${base}/local`, headers: { Host: 'a.test' } })).resolves.toMatchObject({
      status: 200
    })
  })
})
