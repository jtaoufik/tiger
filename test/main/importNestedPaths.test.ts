import { chmod, cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  dialog: {}
}))

import { importPaths, readBrunoFolder } from '../../src/main/importers'
import { collectionFiles, type CollectionSnapshot } from '../../src/core/collectionFiles'
import { saveCollectionFiles } from '../../src/main/saveCollection'
import { readCollection, readOpenedCollection } from '../../src/main/collection'
import { parseCollectionSettings } from '../../src/core/collectionSettings'
import { layerCollectionVariables, summarizeImport, type ImportResult } from '../../src/core/import'
import type { TigerRequest } from '../../src/core/types'

const fixtures = join(__dirname, '../core/fixtures/nested')
const deepPostman = join(fixtures, 'deep.postman_collection.json')

/** Every request as "folder/path: name", in import order. */
const placed = (result: ImportResult | null) => (result?.requests ?? []).map((r) => `${r.path.join('/')}: ${r.request.name}`)
const opened = (entries: Array<{ folder: string[]; name: string }>) => entries.map((e) => `${e.folder.join('/')}: ${e.name}`)

const temps: string[] = []
async function temp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'tiger-nested-'))
  temps.push(dir)
  return dir
}
/** Write files (path -> content) under a fresh temp folder; returns the folder. */
async function tree(files: Record<string, string>, root?: string): Promise<string> {
  root ??= await temp()
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
  return root
}
afterAll(async () => {
  // An unreadable folder must be readable again before the runner cleans up.
  for (const dir of temps) await chmod(join(dir, 'locked'), 0o755).catch(() => undefined)
})

const bru = (name: string, url: string, seq = 1) =>
  `meta {\n  name: ${name}\n  type: http\n  seq: ${seq}\n}\n\nget {\n  url: ${url}\n  body: none\n  auth: inherit\n}\n`
const postman = (name: string, folder = 'F') =>
  JSON.stringify({
    info: { name, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    item: [{ name: folder, item: [{ name: 'Ping', request: { method: 'GET', url: `https://${name}.test/ping` } }] }]
  })
const request = (name: string, url = 'https://api.test/x'): TigerRequest => ({
  name,
  method: 'get',
  url,
  headers: [],
  query: [],
  body: { type: 'none', content: '' }
})

/** The deep Bruno fixture plus what git cannot keep: a .env, a node_modules and (on POSIX) a folder name Windows refuses. */
async function brunoDeep(): Promise<string> {
  const root = join(await temp(), 'bruno-deep')
  await cp(join(fixtures, 'bruno-deep'), root, { recursive: true })
  await tree(
    {
      '.env': '# Bruno reads these as process.env.*\nADMIN_KEY="k-admin"\n',
      'node_modules/some-lib/fixture.bru': bru('Not mine', 'https://dep.test/skip')
    },
    root
  )
  return root
}

describe('a Bruno collection folder nested three levels deep', () => {
  it('keeps the whole hierarchy, named from folder.bru, in seq order, skipping node_modules', async () => {
    const result = await readBrunoFolder(await brunoDeep())
    expect(result.name).toBe('Deep Bruno')
    expect(placed(result)).toEqual([
      ': Health',
      'Ünïcode ✓ folder/Admin: Stats',
      'Store: front?/Catalog/Reviews: Moderation queue',
      'Store: front?/Catalog/Products: List',
      'Store: front?/Catalog/Products/Reviews: List',
      'Store: front?/Catalog/Products/Reviews: Create',
      'Warehouse/Admin: Stats',
      // Only the root environments folder holds environments.
      'Warehouse/environments: Nested environments folder request'
    ])
    expect(result.environments?.map((e) => e.name)).toEqual(['Local'])
    expect(result.folders).toEqual([
      { path: ['Store: front?', 'Catalog'], auth: { type: 'basic', username: 'catalog-bot', password: '{{pass}}' } }
    ])
    expect(summarizeImport(result)).toMatchObject({ requests: 8, folders: 10, environments: 1 })
  })

  it('reads .env values for process.env variables, and the same through a drop', async () => {
    const root = await brunoDeep()
    const dropped = layerCollectionVariables((await importPaths([root]))!)
    expect(dropped.name).toBe('Deep Bruno')
    expect(dropped.requests).toHaveLength(8)
    expect(dropped.environments?.[0].variables).toContainEqual(
      expect.objectContaining({ name: 'process.env.ADMIN_KEY', value: 'k-admin', secret: true })
    )
  })

  it('imports a nested folder of .bru files without bruno.json as one collection, folders intact', async () => {
    // Read file by file, each request used to become a folder named after its file.
    const files = {
      'repo/README.md': '# api',
      'repo/api/users/get-user.bru': bru('Get user', '{{baseUrl}}/users/1'),
      'repo/api/users/admin/delete-user.bru': bru('Delete user', '{{baseUrl}}/users/1'),
      'repo/api/users/admin/folder.bru': 'meta {\n  name: Admin tools\n}\n'
    }
    const one = await importPaths([await tree(files)])
    expect(one?.name).toBe('users')
    expect(placed(one)).toEqual([': Get user', 'Admin tools: Delete user'])
    // Two such folders side by side: each keeps its tree under its own name.
    const two = await importPaths([await tree({ ...files, 'repo/api/orders/list.bru': bru('List orders', '{{baseUrl}}/orders') })])
    expect(placed(two).sort()).toEqual(['orders: List orders', 'users/Admin tools: Delete user', 'users: Get user'])
  })
})

describe('importPaths: every way a drop or Open can hand over paths', () => {
  it('(a) a single file keeps its nested folders', async () => {
    const result = await importPaths([deepPostman])
    expect(result?.name).toBe('Deep Shop')
    expect(placed(result)).toContain('Store/Catalog/Products/Reviews: Create')
    expect(placed(result)).toHaveLength(9)
  })

  it('(b) a folder holding one collection imports that collection, with its own name', async () => {
    const root = await tree({ 'exports/shop.postman_collection.json': postman('Shop') })
    const result = await importPaths([root])
    expect(result?.name).toBe('Shop')
    expect(placed(result)).toEqual(['F: Ping'])
  })

  it('(c) a collection two folders down is found', async () => {
    const root = await tree({ 'a/b/shop.postman_collection.json': postman('Shop') })
    expect(placed(await importPaths([root]))).toEqual(['F: Ping'])
  })

  it('(d) two collections at different depths each get their own folder, even with the same file name', async () => {
    const root = await tree({
      'alpha/collection.json': postman('Alpha'),
      'beta/deep/collection.json': postman('Beta'),
      'gamma.json': postman('Gamma')
    })
    const result = await importPaths([root])
    expect(placed(result).sort()).toEqual(['collection 2/F: Ping', 'collection/F: Ping', 'gamma/F: Ping'])
    // Each request still points at its own API.
    const hosts = result!.requests.map((r) => r.request.url).sort()
    expect(hosts).toEqual(['https://Alpha.test/ping', 'https://Beta.test/ping', 'https://Gamma.test/ping'])
    expect(summarizeImport(result!)).toMatchObject({ requests: 3, folders: 6 })
  })

  it('(e) a Bruno collection beside stray JSON files: the collection whole, exports imported, the rest skipped', async () => {
    const root = await tree({
      'api-tests/bruno.json': '{"version":"1","name":"Bru","type":"collection"}',
      'api-tests/users/admin/stats.bru': bru('Stats', '{{baseUrl}}/stats'),
      'package.json': '{"name":"x"}',
      'notes.json': '{"hello":"world"}',
      'other.json': postman('Other')
    })
    const result = await importPaths([root])
    expect(placed(result).sort()).toEqual(['api-tests/users/admin: Stats', 'other/F: Ping'])
    expect(result?.warnings ?? []).toEqual([])
  })

  it('(f) a trailing slash or a dot segment in the dropped path changes nothing', async () => {
    const root = await tree({ 'shop.postman_collection.json': postman('Shop') })
    for (const path of [`${root}/`, `${root}/./`, join(root, 'sub', '..')]) {
      const result = await importPaths([path])
      expect(result?.name).toBe('Shop')
      expect(placed(result)).toEqual(['F: Ping'])
    }
    const bruno = await brunoDeep()
    expect(placed(await importPaths([`${bruno}/`]))).toHaveLength(8)
  })

  it('(g) an empty folder imports nothing, without an error', async () => {
    await expect(importPaths([await temp()])).resolves.toBeNull()
  })

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    '(h) an unreadable sub-directory is skipped, the rest imports',
    async () => {
      const root = await tree({ 'shop.postman_collection.json': postman('Shop'), 'locked/secret.json': postman('Hidden') })
      await chmod(join(root, 'locked'), 0o000)
      const result = await importPaths([root])
      expect(placed(result)).toEqual(['F: Ping'])
      // Opening a saved collection with such a folder works too.
      const { files } = collectionFiles({ name: 'Locked', requests: [{ path: [], request: request('A') }] })
      const saved = await saveCollectionFiles(root, 'Locked', files)
      await mkdir(join(saved, 'locked'))
      await chmod(join(saved, 'locked'), 0o000)
      expect(opened((await readOpenedCollection(saved)).requests)).toEqual([': A'])
      await chmod(join(saved, 'locked'), 0o755)
    }
  )
})

describe('saving an import to disk and reading it back', () => {
  async function roundTrip(snapshot: CollectionSnapshot) {
    const parent = await temp()
    const { files } = collectionFiles(snapshot)
    const root = await saveCollectionFiles(parent, snapshot.name, files)
    const back = await readOpenedCollection(root)
    // A reload (after a git sync, say) must give the same order.
    expect(opened(await readCollection(root))).toEqual(opened(back.requests))
    return { root, files, back }
  }

  it('keeps the Postman tree: depth, order, duplicates, folder auth', async () => {
    const result = (await importPaths([deepPostman]))!
    const { back } = await roundTrip({ name: result.name, requests: result.requests, folders: result.folders, auth: result.auth })
    expect(opened(back.requests)).toEqual(placed(result))
    expect(back.folders.map((f) => f.folder.join('/')).sort()).toEqual(['Store', 'Store/Admin', 'Store/Catalog', 'Warehouse/Admin'])
  })

  it('keeps the Bruno tree, with Windows-illegal names adjusted on disk but the shown name kept in folder.tiger', async () => {
    const result = await readBrunoFolder(await brunoDeep())
    const { root, back } = await roundTrip({ name: result.name, requests: result.requests, folders: result.folders })
    expect(opened(back.requests)).toEqual(placed(result).map((p) => p.replace('Store: front?', 'Store- front-')))
    const settings = parseCollectionSettings(await readFile(join(root, 'Store- front-', 'folder.tiger'), 'utf8'))
    expect(settings).toEqual({ name: 'Store: front?', seq: 2 })
    expect(back.folders).toEqual([
      { folder: ['Store- front-', 'Catalog'], auth: { type: 'basic', username: 'catalog-bot', password: '{{pass}}' } }
    ])
  })

  it('keeps sibling folders in the order the source showed, not alphabetical', async () => {
    const { back, files } = await roundTrip({
      name: 'Ordered',
      requests: [
        { path: ['Zebra'], request: request('z') },
        { path: ['Admin', 'Tools'], request: request('t') },
        { path: ['Admin'], request: request('a') },
        { path: ['Alpha'], request: request('b') },
        { path: ['Alpha'], request: request('a') },
        { path: [], request: request('root') }
      ]
    })
    expect(opened(back.requests)).toEqual([': root', 'Zebra: z', 'Admin: a', 'Admin/Tools: t', 'Alpha: b', 'Alpha: a'])
    expect(files.find((f) => f.path === 'Alpha/folder.tiger')?.content).toBe('meta {\n  seq: 3\n}\n')
  })

  it('never lets a request and a folder with the same name, or a folder path and a folder name, collide', async () => {
    const { back, files } = await roundTrip({
      name: 'Collisions',
      requests: [
        { path: [], request: request('Admin') },
        { path: ['Admin'], request: request('inside') },
        { path: ['a/b'], request: request('slash') },
        { path: ['a', 'b'], request: request('nested') },
        { path: ['a-b'], request: request('dash') },
        { path: ['Users'], request: request('folder') },
        { path: ['Users'], request: request('Users') },
        { path: ['environments'], request: request('root env folder') },
        { path: ['Deep', 'environments'], request: request('nested env folder') }
      ],
      folders: [{ path: ['a/b'], docs: 'slash folder' }, { path: ['a', 'b'], docs: 'nested folder' }]
    })
    expect(opened(back.requests)).toEqual([
      ': Admin',
      'Admin: inside',
      'a-b: slash',
      'a/b: nested',
      'a-b 2: dash',
      'Users: folder',
      'Users: Users',
      'environments 2: root env folder',
      'Deep/environments: nested env folder'
    ])
    expect(files.map((f) => f.path)).toContain('Users/folder 2.tiger')
    expect(back.folders.sort((x, y) => x.folder.length - y.folder.length)).toEqual([
      { folder: ['a-b'], docs: 'slash folder' },
      { folder: ['a', 'b'], docs: 'nested folder' }
    ])
  })

  it('gives reserved and trailing-dot names a stable disk name', async () => {
    const { back } = await roundTrip({
      name: 'Reserved',
      requests: [
        { path: ['CON'], request: request('aux') },
        { path: ['con.'], request: request('nul') },
        { path: ['Reports.'], request: request('x') },
        { path: ['.hidden'], request: request('shown') }
      ]
    })
    expect(opened(back.requests)).toEqual([': ', 'CON_: aux', 'con_ 2: nul', 'Reports: x', 'hidden: shown'].slice(1))
  })
})
