// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The renames can be made to fail the way Windows fails them when another
// program holds the target open; everything else goes to the real disk.
const renames = vi.hoisted(() => ({ fail: null as string | null }))
const failing = () => {
  const e = new Error(`${renames.fail}: rename refused`) as NodeJS.ErrnoException
  e.code = renames.fail ?? undefined
  return e
}
vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...real,
    rename: async (from: string, to: string) => {
      if (renames.fail) throw failing()
      return real.rename(from, to)
    }
  }
})
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>()
  return {
    ...real,
    renameSync: (from: string, to: string) => {
      if (renames.fail) throw failing()
      return real.renameSync(from, to)
    }
  }
})

import { writeAtomic, writeAtomicSync } from '../../src/main/atomicWrite'

let dir = ''
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'tiger-atomic-'))
})
afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})
const temps = () => readdirSync(dir).filter((f) => f.endsWith('.tmp'))

describe('writeAtomic', () => {
  it('creates a file and leaves no temporary file behind', async () => {
    const path = join(dir, 'a.json')
    await writeAtomic(path, '{"a":1}')
    writeAtomicSync(join(dir, 'b.json'), '{"b":2}')
    expect(readFileSync(path, 'utf8')).toBe('{"a":1}')
    expect(readFileSync(join(dir, 'b.json'), 'utf8')).toBe('{"b":2}')
    expect(temps()).toEqual([])
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
    mkdirSync(folder)
    writeFileSync(join(dir, 'keep.json'), 'old')
    await expect(writeAtomic(folder, 'x')).rejects.toThrow()
    expect(() => writeAtomicSync(folder, 'x')).toThrow()
    expect(statSync(folder).isDirectory()).toBe(true)
    expect(readFileSync(join(dir, 'keep.json'), 'utf8')).toBe('old')
    expect(temps()).toEqual([])
  })

  it.skipIf(process.platform === 'win32')('writes through a symlink and keeps the file mode', async () => {
    // A settings.json kept in a dotfiles folder, chmod 600 because it holds passwords.
    const real = join(dir, 'real-settings.json')
    writeFileSync(real, '{"old":true}', { mode: 0o600 })
    const link = join(dir, 'settings.json')
    symlinkSync(real, link)
    await writeAtomic(link, '{"new":1}')
    expect(lstatSync(link).isSymbolicLink()).toBe(true)
    expect(readFileSync(real, 'utf8')).toBe('{"new":1}')
    expect(statSync(real).mode & 0o777).toBe(0o600)
    writeAtomicSync(link, '{"new":2}')
    expect(lstatSync(link).isSymbolicLink()).toBe(true)
    expect(readFileSync(real, 'utf8')).toBe('{"new":2}')
    expect(statSync(real).mode & 0o777).toBe(0o600)
    expect(temps()).toEqual([])
  })
})

describe('writeAtomic when the rename is refused', () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
  afterEach(() => {
    renames.fail = null
    Object.defineProperty(process, 'platform', platform)
  })

  it('on Windows falls back to writing the file in place, leaving no temporary file', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    renames.fail = 'EPERM'
    const path = join(dir, 'held-open.tiger')
    writeFileSync(path, 'old')
    await writeAtomic(path, 'new async')
    expect(readFileSync(path, 'utf8')).toBe('new async')
    writeAtomicSync(path, 'new sync')
    expect(readFileSync(path, 'utf8')).toBe('new sync')
    expect(temps()).toEqual([])
  })

  it('elsewhere the error surfaces and the old file is kept', async () => {
    renames.fail = 'EPERM'
    const path = join(dir, 'posix.tiger')
    writeFileSync(path, 'old')
    await expect(writeAtomic(path, 'new')).rejects.toThrow(/EPERM/)
    expect(() => writeAtomicSync(path, 'new')).toThrow(/EPERM/)
    expect(readFileSync(path, 'utf8')).toBe('old')
    expect(temps()).toEqual([])
  })
})
