// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeAtomic, writeAtomicSync } from '../../src/main/atomicWrite'

let dir = ''
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'tiger-atomic-'))
})
afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('writeAtomic', () => {
  it('creates a file and leaves no temporary file behind', async () => {
    const path = join(dir, 'a.json')
    await writeAtomic(path, '{"a":1}')
    writeAtomicSync(join(dir, 'b.json'), '{"b":2}')
    expect(readFileSync(path, 'utf8')).toBe('{"a":1}')
    expect(readFileSync(join(dir, 'b.json'), 'utf8')).toBe('{"b":2}')
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  it('replaces an existing file whole', async () => {
    const path = join(dir, 'c.json')
    writeFileSync(path, 'a much longer earlier content that must not survive in part')
    await writeAtomic(path, 'short')
    expect(readFileSync(path, 'utf8')).toBe('short')
    writeAtomicSync(path, Buffer.from([1, 2, 3]))
    expect([...readFileSync(path)]).toEqual([1, 2, 3])
  })

  it('on failure keeps the old file intact and removes its temporary file', async () => {
    const path = join(dir, 'missing', 'd.json')
    await expect(writeAtomic(path, 'x')).rejects.toThrow()
    expect(() => writeAtomicSync(path, 'x')).toThrow()
    // A target that is a folder cannot be renamed over: the folder stays, no .tmp remains.
    const folder = join(dir, 'folder')
    writeFileSync(join(dir, 'keep.json'), 'old')
    expect(() => writeAtomicSync(folder + '/', 'x')).toThrow()
    expect(readFileSync(join(dir, 'keep.json'), 'utf8')).toBe('old')
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })
})
