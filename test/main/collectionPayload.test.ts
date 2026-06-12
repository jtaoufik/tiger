import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readOpenedCollection } from '../../src/main/collection'

let root = ''

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'tiger-col-'))
  await writeFile(
    join(root, 'collection.tiger'),
    'meta {\n  name: Payments API\n}\nauth:bearer {\n  token: {{token}}\n}\n'
  )
  await mkdir(join(root, 'posts'))
  await writeFile(join(root, 'a.tiger'), 'meta {\n  name: Alpha\n}\nget {\n  url: https://x/a\n}\n')
  await writeFile(
    join(root, 'posts', 'b.tiger'),
    'meta {\n  name: Beta\n}\npost {\n  url: https://x/b\n}\n'
  )
  await mkdir(join(root, 'environments'))
  await writeFile(join(root, 'environments', 'dev.tiger'), 'meta {\n  name: dev\n}\nvars {\n  a: 1\n}\n')
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('readOpenedCollection', () => {
  it('reads requests, environments and collection settings in one payload', async () => {
    const payload = await readOpenedCollection(root)
    expect(payload.root).toBe(root)
    expect(payload.settings.name).toBe('Payments API')
    expect(payload.settings.auth).toEqual({ type: 'bearer', token: '{{token}}' })
    expect(payload.requests.map((r) => r.name).sort()).toEqual(['Alpha', 'Beta'])
    expect(payload.requests.find((r) => r.name === 'Beta')?.folder).toEqual(['posts'])
    expect(payload.environments.map((e) => e.name)).toEqual(['dev'])
  })

  it('tolerates a missing collection.tiger', async () => {
    const bare = await mkdtemp(join(tmpdir(), 'tiger-bare-'))
    try {
      const payload = await readOpenedCollection(bare)
      expect(payload.settings).toEqual({})
      expect(payload.requests).toEqual([])
    } finally {
      await rm(bare, { recursive: true, force: true })
    }
  })
})
