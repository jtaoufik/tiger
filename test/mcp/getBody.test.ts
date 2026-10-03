// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { gzipSync } from 'node:zlib'
import type { AddressInfo } from 'node:net'
import { createNodeRunner } from '../../src/mcp/store'

let server: Server
let base = ''
beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const payload = JSON.stringify({ method: req.method, body: Buffer.concat(chunks).toString('utf8') })
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' })
      res.end(gzipSync(payload))
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((r) => server.close(() => r())))

describe('MCP run_request', () => {
  it('sends a GET body (Elasticsearch-style search) instead of failing', async () => {
    const res = await createNodeRunner().send({
      method: 'GET',
      url: `${base}/_search`,
      headers: { 'Content-Type': 'application/json' },
      body: '{"query":{"match_all":{}}}'
    })
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ method: 'GET', body: '{"query":{"match_all":{}}}' })
  })
})
