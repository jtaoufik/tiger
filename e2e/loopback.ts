/**
 * Helpers for specs that check what Send puts on the wire: a loopback server
 * whose routes the spec writes, and a throwaway disk collection.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export interface Seen {
  method: string
  url: string
  headers: IncomingMessage['headers']
  body: string
}

export interface Loopback {
  /** http://127.0.0.1:<port> */
  url: string
  port: number
  requests: Seen[]
  close: () => Promise<void>
}

/** A route answers and returns true, or returns false to fall through to the JSON echo. */
export type Route = (req: Seen, res: ServerResponse) => boolean

/**
 * Records every request, then lets `route` answer it; anything it leaves
 * gets a JSON echo of the method, URL and Cookie header. Listens on both
 * stacks, so 127.0.0.1 and localhost (::1) both reach it.
 */
export async function startLoopback(route: Route = () => false): Promise<Loopback> {
  const requests: Seen[] = []
  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const seen = {
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }
      requests.push(seen)
      if (route(seen, res)) return
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ method: seen.method, url: seen.url, cookie: req.headers.cookie ?? null }))
    })
  })
  await new Promise<void>((r) => server.listen(0, '::', r))
  const port = (server.address() as AddressInfo).port
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    requests,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections()
        server.close(() => r())
      })
  }
}

/** The path part of a recorded request URL. */
export function pathOf(seen: Seen): string {
  return seen.url.split('?')[0]
}

/**
 * A disk collection named "jsonplaceholder" (the name the fixtures' helpers
 * look for) holding `files`, relative path to text. Returns its folder.
 */
export function writeCollection(files: Record<string, string>): string {
  const parent = mkdtempSync(join(tmpdir(), 'tiger-e2e-wire-'))
  const dir = join(parent, 'jsonplaceholder')
  for (const [rel, text] of Object.entries(files)) {
    const full = join(dir, rel)
    mkdirSync(resolve(full, '..'), { recursive: true })
    writeFileSync(full, text)
  }
  return dir
}

/** An environment file setting baseUrl. */
export function envFile(baseUrl: string): string {
  return `meta {\n  name: dev\n}\n\nvars {\n  baseUrl: ${baseUrl}\n}\n`
}

/** A request file; `blocks` are appended as written (headers, body, ...). */
export function requestFile(name: string, method: string, url: string, blocks = ''): string {
  return `meta {\n  name: ${name}\n}\n\n${method.toLowerCase()} {\n  url: ${url}\n}\n${blocks ? `\n${blocks}` : ''}`
}
