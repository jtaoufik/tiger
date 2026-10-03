import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readEnvironments, readOpenedCollection } from '../../src/main/collection'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function collectionWithEnvs(files: Record<string, Buffer | string>): string {
  const root = mkdtempSync(join(tmpdir(), 'tiger-enc-'))
  dirs.push(root)
  mkdirSync(join(root, 'environments'))
  for (const [name, content] of Object.entries(files)) writeFileSync(join(root, 'environments', name), content)
  return root
}

const env = (name: string) => `meta {\n  name: ${name}\n}\n\nvars {\n  baseUrl: https://${name}.test\n}\n`

describe('environments saved by Windows tools', () => {
  it('reads a UTF-16 file (PowerShell >) and one with a BOM, and one broken file hides only itself', async () => {
    const root = collectionWithEnvs({
      'dev.tiger': env('dev'),
      'local.tiger': Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(env('local'), 'utf16le')]),
      'bom.tiger': `﻿${env('bom')}`,
      'broken.tiger': 'meta {\n  name: broken\n}\nvars {\n  apiKey\n}\n'
    })
    const names = (await readEnvironments(root)).map((e) => e.name).sort()
    expect(names).toEqual(['bom', 'dev', 'local'])
    expect((await readOpenedCollection(root)).environments.map((e) => e.name).sort()).toEqual(['bom', 'dev', 'local'])
  })
})
