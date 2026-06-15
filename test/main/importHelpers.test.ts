import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { expandPaths, mergeImports, rootNameFor } from '../../src/main/importHelpers'
import type { ImportResult } from '../../src/core/import'

async function makeTree(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'tiger-import-'))
  await writeFile(join(root, 'top.json'), '{}')
  await writeFile(join(root, 'notes.txt'), 'ignore me')
  await mkdir(join(root, 'sub'))
  await writeFile(join(root, 'sub', 'a.json'), '{}')
  await writeFile(join(root, 'sub', 'b.yaml'), 'name: b')
  await mkdir(join(root, '.hidden'))
  await writeFile(join(root, '.hidden', 'skip.json'), '{}')
  return root
}

describe('expandPaths', () => {
  it('walks directories recursively for matching extensions', async () => {
    const root = await makeTree()
    const files = await expandPaths([root], ['json', 'yaml'])
    expect(files.map((f) => f.replace(root, '')).sort()).toEqual([
      '/sub/a.json',
      '/sub/b.yaml',
      '/top.json'
    ])
  })

  it('keeps plain files through, regardless of extension match', async () => {
    const root = await makeTree()
    const single = join(root, 'top.json')
    expect(await expandPaths([single], ['json'])).toEqual([single])
  })

  it('handles a mix of files and directories in one call', async () => {
    const root = await makeTree()
    const files = await expandPaths([join(root, 'top.json'), join(root, 'sub')], ['json'])
    expect(files.sort()).toEqual([join(root, 'sub', 'a.json'), join(root, 'top.json')])
  })

  it('skips dotfiles and dotdirs', async () => {
    const root = await makeTree()
    const files = await expandPaths([root], ['json'])
    expect(files.some((f) => f.includes('/.hidden/'))).toBe(false)
  })

  it('matches extensions case-insensitively', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tiger-import-'))
    await writeFile(join(root, 'CAPS.JSON'), '{}')
    expect(await expandPaths([root], ['json'])).toEqual([join(root, 'CAPS.JSON')])
  })

  it('ignores paths that no longer exist', async () => {
    const files = await expandPaths(['/no/such/path'], ['json'])
    expect(files).toEqual([])
  })
})

describe('rootNameFor', () => {
  it('strips the extension from a single file selection', () => {
    expect(rootNameFor(['/x/Sample API.json'])).toBe('Sample API')
  })

  it('uses the basename for a single directory selection', () => {
    expect(rootNameFor(['/x/my-collections'])).toBe('my-collections')
  })

  it('falls back to the common parent for multiple selections', () => {
    expect(rootNameFor(['/x/team/a.json', '/x/team/b.json'])).toBe('team')
  })

  it('has a sensible default for an empty list', () => {
    expect(rootNameFor([])).toBe('Imported collection')
  })
})

describe('mergeImports', () => {
  const a: ImportResult = {
    name: 'A',
    source: 'postman',
    requests: [
      {
        path: ['Users'],
        request: { name: 'Get user', method: 'get', url: 'x', headers: [], query: [], body: { type: 'text', content: '' } }
      }
    ]
  }
  const b: ImportResult = {
    name: 'B',
    source: 'postman',
    requests: [
      {
        path: [],
        request: { name: 'Ping', method: 'get', url: 'y', headers: [], query: [], body: { type: 'text', content: '' } }
      }
    ],
    environments: [{ name: 'dev', variables: [{ name: 'k', value: 'v', enabled: true }] }]
  }

  it('nests each result under a folder named after its source file', () => {
    const merged = mergeImports(
      [{ name: 'a', result: a }, { name: 'b', result: b }],
      'postman',
      'team'
    )
    expect(merged.name).toBe('team')
    expect(merged.requests.map((r) => r.path)).toEqual([['a', 'Users'], ['b']])
  })

  it('concatenates environments and omits the field when empty', () => {
    const merged = mergeImports(
      [{ name: 'a', result: a }, { name: 'b', result: b }],
      'postman',
      'team'
    )
    expect(merged.environments?.map((e) => e.name)).toEqual(['dev'])

    const noEnv = mergeImports([{ name: 'a', result: a }], 'postman', 'team')
    expect(noEnv.environments).toBeUndefined()
  })
})
