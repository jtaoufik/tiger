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
import { handleListRequests } from '../../src/mcp/handlers'

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
