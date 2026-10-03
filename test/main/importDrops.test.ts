import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const savedAs: string[] = []
vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  dialog: {
    showSaveDialog: async (_window: unknown, options: { defaultPath: string }) => {
      savedAs.push(options.defaultPath)
      return { canceled: true }
    }
  }
}))

import { importPaths, saveExport } from '../../src/main/importers'

/** Write files (path -> content) under a fresh temp folder; returns the folder. */
async function tree(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'tiger-drop-'))
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
  return root
}

const bru = (name: string, url: string, blocks = '') =>
  `meta {\n  name: ${name}\n  type: http\n  seq: 1\n}\n\npost {\n  url: ${url}\n  body: none\n  auth: inherit\n}\n${blocks}`

const postmanCollection = (name: string) =>
  JSON.stringify({
    info: { name, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    item: [{ name: 'Ping', request: { method: 'GET', url: 'https://x.test/ping' } }]
  })

describe('dropping a project folder that holds a Bruno collection', () => {
  const repo = () =>
    tree({
      'package.json': '{"name":"shop","private":true}',
      'tsconfig.json': '{"compilerOptions":{"strict":true}}',
      'api-tests/bruno.json': '{"version":"1","name":"Shop (Bruno)","type":"collection"}',
      'api-tests/collection.bru': 'auth {\n  mode: bearer\n}\n\nauth:bearer {\n  token: {{token}}\n}\n',
      'api-tests/users/folder.bru': 'meta {\n  name: User management\n}\n\nauth {\n  mode: basic\n}\n\nauth:basic {\n  username: admin\n  password: {{adminPassword}}\n}\n',
      'api-tests/users/create-user.bru': bru('Create user', '{{baseUrl}}/users'),
      'api-tests/environments/Local.bru': 'vars {\n  baseUrl: http://localhost:3000\n}\n',
      // A dependency's test fixture is not the user's collection.
      'node_modules/some-lib/fixtures/demo.postman_collection.json': postmanCollection('Not mine')
    })

  it('reads the Bruno folder as one collection, with its collection and folder auth', async () => {
    const result = (await importPaths([await repo()]))!
    expect(result.name).toBe('Shop (Bruno)')
    expect(result.requests.map((r) => [r.path, r.request.name])).toEqual([[['User management'], 'Create user']])
    expect(result.auth).toEqual({ type: 'bearer', token: '{{token}}' })
    expect(result.folders).toEqual([
      { path: ['User management'], auth: { type: 'basic', username: 'admin', password: '{{adminPassword}}' } }
    ])
    expect(result.environments?.map((e) => e.name)).toEqual(['Local'])
  })

  it('reports nothing about the project\'s own JSON files, and never walks node_modules', async () => {
    const result = (await importPaths([await repo()]))!
    expect(result.warnings ?? []).toEqual([])
  })

  it('says there is nothing to import in a folder of files that are not exports', async () => {
    const root = await tree({ 'package.json': '{"name":"x"}', 'docs/mkdocs.yml': 'site_name: Docs\n' })
    await expect(importPaths([root])).resolves.toBeNull()
  })

  it('never turns a stray folder.bru into an empty request', async () => {
    const root = await tree({
      'requests/folder.bru': 'meta {\n  name: Stray\n}\n',
      'requests/ping.bru': bru('Ping', 'https://x.test/ping')
    })
    const result = (await importPaths([root]))!
    expect(result.requests.map((r) => r.request.name)).toEqual(['Ping'])
  })
})

describe('dropped files the detection missed', () => {
  it('points a Postman v1 collection at the v2.1 export instead of "not a Postman export"', async () => {
    const root = await tree({
      'legacy.postman_collection.json': JSON.stringify({
        id: 'c1',
        name: 'Legacy',
        order: ['r1'],
        folders: [],
        requests: [{ id: 'r1', name: 'List', url: 'https://x.test/items', method: 'GET' }]
      })
    })
    await expect(importPaths([join(root, 'legacy.postman_collection.json')])).rejects.toThrow(
      /Postman v1 collection\. Export it again from Postman as Collection v2\.1/
    )
  })

  it('reads a Swagger YAML whose version is unquoted (swagger: 2.0 is a number in YAML)', async () => {
    const root = await tree({
      'swagger.yaml': 'swagger: 2.0\ninfo:\n  title: Legacy\n  version: 1.0.0\nhost: legacy.test\npaths:\n  /ping:\n    get:\n      summary: Ping\n'
    })
    const result = (await importPaths([join(root, 'swagger.yaml')]))!
    expect(result.requests.map((r) => r.request.name)).toEqual(['Ping'])
  })
})

describe('export file names', () => {
  it('gives the save dialog a name Windows accepts, keeping the export suffix', async () => {
    savedAs.length = 0
    for (const name of ['CON.postman_collection.json', 'Users: v2. .openapi.json', 'a/b?.tiger', 'Shop API.postman_collection.json']) {
      await saveExport(name, '{}')
    }
    expect(savedAs).toEqual([
      'CON_.postman_collection.json',
      'Users- v2.openapi.json',
      'a-b-.tiger',
      'Shop API.postman_collection.json'
    ])
  })
})
