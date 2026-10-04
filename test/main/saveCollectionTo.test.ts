/**
 * "Save to a folder": an import written into a folder the user picked reads
 * back as the same collection, and the writer never touches existing files.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { importPostman, layerCollectionVariables } from '../../src/core/import'
import { collectionFiles } from '../../src/core/collectionFiles'
import { parseRequest } from '../../src/core/tigerFormat'
import { parseEnvironment } from '../../src/core/environment'
import {
  freeCollectionFolder,
  isEmptyFolder,
  saveCollectionFiles,
  saveCollectionInto
} from '../../src/main/saveCollection'
import { readOpenedCollection } from '../../src/main/collection'

const dirs: string[] = []
const tempDir = () => {
  const d = mkdtempSync(join(tmpdir(), 'tiger-save-to-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** A Postman v2.1 export with folders, auth, a body and collection variables. */
const postman = {
  info: {
    name: 'Shop',
    description: 'The shop API.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
  },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
  variable: [
    { key: 'baseUrl', value: 'https://shop.test' },
    { key: 'token', value: 't-1' }
  ],
  item: [
    { name: 'Health', request: { method: 'GET', url: '{{baseUrl}}/health' } },
    {
      name: 'Orders',
      auth: { type: 'apikey', apikey: [{ key: 'key', value: 'X-Key' }, { key: 'value', value: '{{key}}' }] },
      item: [
        {
          name: 'Create order',
          request: {
            method: 'POST',
            header: [{ key: 'Accept', value: 'application/json' }],
            url: { raw: '{{baseUrl}}/orders?dry=1', host: ['{{baseUrl}}'], path: ['orders'], query: [{ key: 'dry', value: '1' }] },
            body: { mode: 'raw', raw: '{"sku": "A-1", "qty": 2}', options: { raw: { language: 'json' } } }
          }
        },
        { name: 'Get order: #1', request: { method: 'GET', url: '{{baseUrl}}/orders/1' } }
      ]
    }
  ]
}

describe('saving an import into a picked folder', () => {
  it('round-trips: import, save, read back equals what was imported', async () => {
    const result = layerCollectionVariables(importPostman(postman))
    const dir = tempDir()
    const { files } = collectionFiles({
      name: result.name,
      requests: result.requests,
      folders: result.folders,
      environments: result.environments,
      auth: result.auth,
      docs: result.docs
    })
    expect(await saveCollectionInto(dir, files)).toBe(dir)

    const opened = await readOpenedCollection(dir)
    expect(opened.settings.name).toBe(result.name)
    expect(opened.settings.auth).toEqual(result.auth)
    expect(opened.settings.docs).toBe(result.docs)
    expect(opened.folders.map((f) => ({ path: f.folder, auth: f.auth }))).toEqual(
      (result.folders ?? []).filter((f) => f.auth).map((f) => ({ path: f.path, auth: f.auth }))
    )
    // Every request, in order, in its folder, with the same content.
    const read = opened.requests.map((r) => ({ path: r.folder, request: parseRequest(readFileSync(r.path, 'utf8')) }))
    const strip = ({ seq: _seq, ...rest }: { seq?: number } & Record<string, unknown>) => rest
    expect(read.map((r) => ({ path: r.path, request: strip(r.request as never) }))).toEqual(
      result.requests.map((r) => ({ path: r.path, request: strip(r.request as never) }))
    )
    // Collection variables come back as an environment.
    expect(result.environments?.length).toBe(1)
    const envs = opened.environments.map((e) => parseEnvironment(readFileSync(e.path, 'utf8')))
    expect(envs).toEqual(result.environments)
  })

  it('writes into an empty folder, ignoring file manager clutter', async () => {
    const dir = tempDir()
    writeFileSync(join(dir, '.DS_Store'), 'x')
    expect(await isEmptyFolder(dir)).toBe(true)
    const { files } = collectionFiles(layerCollectionVariables(importPostman(postman)))
    await saveCollectionInto(dir, files)
    expect(readdirSync(dir).sort()).toEqual(['.DS_Store', 'Health.tiger', 'Orders', 'collection.tiger', 'environments'])
  })

  it('refuses a folder that already holds something, and leaves it untouched', async () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'notes.txt'), 'mine')
    expect(await isEmptyFolder(dir)).toBe(false)
    const { files } = collectionFiles(layerCollectionVariables(importPostman(postman)))
    await expect(saveCollectionInto(dir, files)).rejects.toThrow(/not empty/)
    expect(readdirSync(dir)).toEqual(['notes.txt'])
    expect(readFileSync(join(dir, 'notes.txt'), 'utf8')).toBe('mine')
  })

  it('names the subfolder it would create after the collection, never an existing one', async () => {
    const dir = tempDir()
    expect(await freeCollectionFolder(dir, 'Shop: v2')).toBe(join(dir, 'Shop v2'))
    mkdirSync(join(dir, 'Shop v2'))
    expect(await freeCollectionFolder(dir, 'Shop: v2')).toBe(join(dir, 'Shop v2 2'))
    const root = await saveCollectionFiles(dir, 'Shop: v2', collectionFiles(layerCollectionVariables(importPostman(postman))).files)
    expect(root).toBe(join(dir, 'Shop v2 2'))
    expect(readdirSync(join(dir, 'Shop v2'))).toEqual([])
  })

  it('refuses a path that would leave the folder before writing anything', async () => {
    const dir = tempDir()
    await expect(saveCollectionInto(dir, [{ path: 'ok.tiger', content: 'x' }, { path: '../out.tiger', content: 'x' }])).rejects.toThrow(
      /Invalid file path/
    )
    expect(readdirSync(dir)).toEqual([])
  })
})
