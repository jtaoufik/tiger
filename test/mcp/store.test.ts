// @vitest-environment node
/**
 * The MCP server's filesystem store and HTTP runner against a real collection
 * folder, so they read a collection the way the app does (src/main/collection.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFsStore, createNodeRunner } from '../../src/mcp/store'
import {
  handleGetRequest,
  handleListEnvironments,
  handleListRequests,
  handleRunRequest,
  type HttpRunner
} from '../../src/mcp/handlers'
import type { BuiltRequest } from '../../src/core/request'

/** What the loopback server received. */
interface Seen {
  method: string
  url: string
  headers: IncomingHttpHeaders
  body: Buffer
}
const seen: Seen[] = []
let server: Server
let origin = ''
let base = ''
beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'tiger-mcp-store-'))
  server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body: Buffer.concat(chunks) })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"ok":true}')
    })
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()))
  rmSync(base, { recursive: true, force: true })
})

let count = 0
/** A fresh collection folder holding `files` (relative path -> content). */
function collection(files: Record<string, string>): string {
  const root = join(base, `c${++count}`)
  for (const [rel, text] of Object.entries(files)) {
    const full = join(root, ...rel.split('/'))
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, text)
  }
  return root
}

const request = (name: string, url = 'https://api.test/x'): string =>
  `meta {\n  name: ${name}\n}\nget {\n  url: ${url}\n}\n`

/** A runner that records what would be sent instead of sending it. */
function recordingRunner(): HttpRunner & { sent: BuiltRequest[] } {
  const sent: BuiltRequest[] = []
  return {
    sent,
    oauthToken: async () => 'unused',
    send: async (built) => {
      sent.push(built)
      return { status: 200, statusText: 'OK', headers: {}, body: '{}', timeMs: 1 }
    }
  }
}

describe('list_requests', () => {
  it('lists requests only, not the collection.tiger and folder.tiger settings files', async () => {
    const root = collection({
      'collection.tiger': 'meta {\n  name: Shop\n}\n',
      'admin/folder.tiger': 'auth:bearer {\n  token: t\n}\n',
      'admin/list.tiger': request('List'),
      'admin/nested/collection.tiger': 'meta {\n  name: Not a request either\n}\n'
    })
    const listed = JSON.parse((await handleListRequests(createFsStore(root))).content[0].text)
    expect(listed).toEqual([{ name: 'List', path: join('admin', 'list.tiger') }])
  })
})

describe('run_request auth', () => {
  it('sends the default auth of the folder.tiger above the request, then the collection’s', async () => {
    const root = collection({
      'collection.tiger': 'auth:bearer {\n  token: collection-token\n}\n',
      'admin/folder.tiger': 'auth:bearer {\n  token: folder-token\n}\n',
      'admin/users/list.tiger': request('List users'),
      'public/get.tiger': request('Public')
    })
    const store = createFsStore(root)
    const runner = recordingRunner()
    await handleRunRequest(store, runner, { path: join('admin', 'users', 'list.tiger') })
    await handleRunRequest(store, runner, { path: join('public', 'get.tiger') })
    expect(runner.sent.map((b) => b.headers.Authorization)).toEqual(['Bearer folder-token', 'Bearer collection-token'])
  })
})

describe('run_request bodies', () => {
  it('sends multipart fields and files, reading a relative file path from the collection folder', async () => {
    const root = collection({
      'files/cat.txt': 'meow bytes',
      'upload.tiger':
        `meta {\n  name: Upload\n}\npost {\n  url: ${origin}/upload\n}\n` +
        'headers {\n  Content-Type: application/json\n}\n' +
        'body:multipart {\n  caption: holiday\n  photo: @file:files/cat.txt\n  ~draft: yes\n}\n'
    })
    seen.length = 0
    const result = await handleRunRequest(createFsStore(root), createNodeRunner(root), { path: 'upload.tiger' })
    expect(result.isError).toBeFalsy()

    expect(seen).toHaveLength(1)
    const type = String(seen[0].headers['content-type'])
    // The boundary type replaces the request's own Content-Type, as in the app.
    expect(type).toMatch(/^multipart\/form-data; boundary=\S+$/)
    const boundary = type.split('boundary=')[1]
    const body = seen[0].body.toString('utf8')
    expect(body).toContain('Content-Disposition: form-data; name="caption"\r\n\r\nholiday\r\n')
    expect(body).toContain(
      'Content-Disposition: form-data; name="photo"; filename="cat.txt"\r\n' +
        'Content-Type: application/octet-stream\r\n\r\nmeow bytes\r\n'
    )
    expect(body).not.toContain('draft')
    expect(body.endsWith(`--${boundary}--\r\n`)).toBe(true)
  })
})

describe('paths sent by the AI client', () => {
  it('refuses one that leaves the collection folder, without quoting the file it points at', async () => {
    const root = collection({ 'users/get.tiger': request('Get user') })
    const secret = join(root, '..', 'secrets.env')
    writeFileSync(secret, 'API_KEY=sk-live-123\n')
    const store = createFsStore(root)
    const runner = recordingRunner()

    const outside = ['../secrets.env', join('users', '..', '..', 'secrets.env'), secret, join(root, 'users', 'get.tiger')]
    for (const path of outside) {
      const got = await handleGetRequest(store, path)
      expect(got.isError).toBe(true)
      expect(got.content[0].text).toContain('the path must be relative to the collection folder and stay inside it')
      expect(got.content[0].text).not.toContain('sk-live')
      const ran = await handleRunRequest(store, runner, { path })
      expect(ran.isError).toBe(true)
      expect(ran.content[0].text).not.toContain('sk-live')
    }
    expect(runner.sent).toEqual([])

    // Relative paths inside the collection still work, however they are written.
    expect((await handleGetRequest(store, join('users', 'get.tiger'))).isError).toBeFalsy()
    expect((await handleGetRequest(store, './users/../users/get.tiger')).isError).toBeFalsy()
  })

  it('applies the folder auth of the folder a path written with .. ends up in', async () => {
    const root = collection({
      'collection.tiger': 'auth:bearer {\n  token: collection-token\n}\n',
      'admin/folder.tiger': 'auth:bearer {\n  token: admin-token\n}\n',
      'admin/users/list.tiger': request('List users'),
      'public/get.tiger': request('Public')
    })
    const runner = recordingRunner()
    await handleRunRequest(createFsStore(root), runner, { path: 'admin/../public/get.tiger' })
    await handleRunRequest(createFsStore(root), runner, { path: 'public/../admin/users/list.tiger' })
    expect(runner.sent.map((b) => b.headers.Authorization)).toEqual(['Bearer collection-token', 'Bearer admin-token'])
  })
})

describe('list_environments', () => {
  it('keeps every readable environment when one environment file cannot be read', async () => {
    const root = collection({
      'environments/dev.tiger': 'meta {\n  name: dev\n}\nvars {\n  baseUrl: https://dev.test\n}\n',
      'environments/broken.tiger': '%% not a Tiger file {\n',
      'environments/staging.tiger': 'meta {\n  name: staging\n}\nvars {\n  baseUrl: https://staging.test\n}\n'
    })
    const store = createFsStore(root)
    const listed = JSON.parse((await handleListEnvironments(store)).content[0].text) as Array<{ name: string }>
    expect(listed.map((e) => e.name).sort()).toEqual(['dev', 'staging'])
    expect(await store.readEnvironment('staging')).toMatchObject({
      name: 'staging',
      variables: [{ name: 'baseUrl', value: 'https://staging.test' }]
    })
  })
})
