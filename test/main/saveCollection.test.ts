import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collectionFiles, safeFileName, type CollectionSnapshot } from '../../src/core/collectionFiles'
import { saveCollectionFiles } from '../../src/main/saveCollection'
import { readOpenedCollection } from '../../src/main/collection'
import { parseEnvironment } from '../../src/core/environment'
import { readFileSync } from 'node:fs'
import type { TigerRequest } from '../../src/core/types'

const req = (name: string, url = 'https://api.test/x'): TigerRequest => ({
  name,
  method: 'get',
  url,
  headers: [],
  query: [],
  body: { type: 'none', content: '' }
})

const dirs: string[] = []
const tempDir = () => {
  const d = mkdtempSync(join(tmpdir(), 'tiger-save-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('safeFileName', () => {
  it('gives names every file system accepts', () => {
    expect(safeFileName('Get: user/{id}?', 'R')).toBe('Get- user-{id}-')
    expect(safeFileName('CON', 'R')).toBe('CON_')
    expect(safeFileName('nul.tiger', 'R')).toBe('nul.tiger_')
    expect(safeFileName('trailing dot. ', 'R')).toBe('trailing dot')
    expect(safeFileName('...', 'R')).toBe('R')
    expect(safeFileName('  ', 'R')).toBe('R')
    expect(Array.from(safeFileName('é'.repeat(200), 'R')).length).toBeLessThanOrEqual(60)
  })
})

describe('saving a collection that lived in memory', () => {
  const snapshot: CollectionSnapshot = {
    name: 'Shop API: v2',
    auth: { type: 'bearer', token: '{{token}}' },
    docs: 'The shop.',
    requests: [
      { path: [], request: req('Login') },
      { path: [], request: req('Health') },
      { path: [], request: req('collection') },
      { path: ['Users'], request: req('Zeta list') },
      { path: ['Users'], request: req('Alpha create') },
      { path: ['Users'], request: req('Alpha create') },
      { path: ['Users'], request: req('alpha CREATE') },
      { path: ['Users'], request: req('folder') },
      { path: ['Users', 'Admin: tools'], request: req('CON') },
      { path: ['environments'], request: req('Inside a folder named environments') }
    ],
    folders: [{ path: ['Users'], auth: { type: 'apikey', key: 'X-Key', value: '{{key}}', in: 'header' } }],
    environments: [
      { name: 'Dev', variables: [{ name: 'token', value: 'dev-token', enabled: true }] },
      { name: 'dev', variables: [{ name: 'token', value: 'other', enabled: true }] },
      { name: 'Prod / EU', variables: [{ name: 'token', value: 'p', enabled: true }] }
    ]
  }

  it('reopens with every request, in the order the source tool showed', async () => {
    const parent = tempDir()
    const { files } = collectionFiles(snapshot)
    const root = await saveCollectionFiles(parent, snapshot.name, files)
    const opened = await readOpenedCollection(root)

    expect(opened.settings.name).toBe('Shop API: v2')
    expect(opened.settings.auth).toEqual({ type: 'bearer', token: '{{token}}' })
    expect(opened.settings.docs).toBe('The shop.')
    expect(opened.requests.map((r) => [r.folder.join('/'), r.name])).toEqual([
      ['', 'Login'],
      ['', 'Health'],
      ['', 'collection'],
      ['environments 2', 'Inside a folder named environments'],
      ['Users', 'Zeta list'],
      ['Users', 'Alpha create'],
      ['Users', 'Alpha create'],
      ['Users', 'alpha CREATE'],
      ['Users', 'folder'],
      ['Users/Admin- tools', 'CON']
    ])
  })

  it('keeps folder auth, environments that differ only in case, and Tiger’s own files intact', async () => {
    const parent = tempDir()
    const { files } = collectionFiles(snapshot)
    const root = await saveCollectionFiles(parent, snapshot.name, files)
    const opened = await readOpenedCollection(root)

    expect(opened.folders).toEqual([
      { folder: ['Users'], auth: { type: 'apikey', key: 'X-Key', value: '{{key}}', in: 'header' } }
    ])
    expect(opened.environments.map((e) => e.name).sort()).toEqual(['Dev', 'Prod / EU', 'dev'])
    const dev = opened.environments.find((e) => e.name === 'dev')!
    expect(parseEnvironment(readFileSync(dev.path, 'utf8')).variables[0].value).toBe('other')
    // Requests named "collection" and "folder" did not overwrite the settings files.
    expect(readdirSync(join(root, 'Users')).sort()).toContain('folder.tiger')
    expect(readFileSync(join(root, 'Users', 'folder.tiger'), 'utf8')).toContain('auth:apikey')
    expect(readFileSync(join(root, 'collection.tiger'), 'utf8')).toContain('name: Shop API: v2')
  })

  it('never writes into an existing folder', async () => {
    const parent = tempDir()
    const { files } = collectionFiles({ name: 'Same', requests: [{ path: [], request: req('A') }] })
    const first = await saveCollectionFiles(parent, 'Same', files)
    const second = await saveCollectionFiles(parent, 'Same', files)
    expect(first).toBe(join(parent, 'Same'))
    expect(second).toBe(join(parent, 'Same 2'))
  })

  it('refuses paths that would leave the collection folder', async () => {
    const parent = tempDir()
    await expect(
      saveCollectionFiles(parent, 'Evil', [{ path: '../outside.tiger', content: 'x' }])
    ).rejects.toThrow(/Invalid file path/)
    await expect(saveCollectionFiles(parent, 'Evil', [{ path: 'C:/x.tiger', content: 'x' }])).rejects.toThrow()
    expect(readdirSync(parent)).toEqual([])
  })
})
