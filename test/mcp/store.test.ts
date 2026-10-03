// @vitest-environment node
/**
 * The MCP server's filesystem store and HTTP runner against a real collection
 * folder, so they read a collection the way the app does (src/main/collection.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFsStore } from '../../src/mcp/store'
import {
  handleListEnvironments,
  handleListRequests,
  handleRunRequest,
  type HttpRunner
} from '../../src/mcp/handlers'
import type { BuiltRequest } from '../../src/core/request'

let base = ''
beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'tiger-mcp-store-'))
})
afterAll(() => rmSync(base, { recursive: true, force: true }))

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
