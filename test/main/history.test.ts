// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// userData is switched per test: a real folder, then a path nothing can write under.
const userData = vi.hoisted(() => ({ path: '' }))
const logged = vi.hoisted(() => ({ calls: [] as unknown[][] }))
vi.mock('electron', () => ({ app: { getPath: () => userData.path } }))
vi.mock('../../src/main/resilience', () => ({
  logMainError: (...args: unknown[]) => {
    logged.calls.push(args)
  }
}))

import { appendHistory, clearHistory, flushHistory, readHistory, type HistoryEntry } from '../../src/main/history'

const entry = (id: string): HistoryEntry => ({
  id,
  at: 1,
  method: 'GET',
  url: 'http://x.test/',
  status: 200,
  ok: true,
  timeMs: 5
})

let base = ''
beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'tiger-history-'))
})
afterAll(() => {
  rmSync(base, { recursive: true, force: true })
})
beforeEach(() => {
  userData.path = base
  logged.calls = []
})

describe('history on disk', () => {
  it('appends newest first, keeps 200 entries, and reads back what it wrote', async () => {
    clearHistory()
    for (let i = 0; i < 205; i++) appendHistory(entry(`e${i}`))
    const read = readHistory()
    expect(read).toHaveLength(200)
    expect(read[0].id).toBe('e204')
    // The writes run after the reply; once flushed the file holds the same list.
    await flushHistory()
    expect(JSON.parse(readFileSync(join(base, 'history.json'), 'utf8'))).toHaveLength(200)
  })

  it('a send does not wait for the disk: 200 appends return at once, one file write chain follows', async () => {
    clearHistory()
    const started = performance.now()
    for (let i = 0; i < 200; i++) appendHistory(entry(`fast${i}`))
    expect(performance.now() - started).toBeLessThan(200)
    await flushHistory()
    const onDisk = JSON.parse(readFileSync(join(base, 'history.json'), 'utf8')) as HistoryEntry[]
    expect(onDisk[0].id).toBe('fast199')
  })

  it('a damaged file reads as empty instead of throwing', async () => {
    // The cache is dropped by a fresh module: emulate by clearing, then damaging the file.
    clearHistory()
    await flushHistory()
    vi.resetModules()
    writeFileSync(join(base, 'history.json'), '[{"id": trunc')
    const fresh = await import('../../src/main/history')
    expect(fresh.readHistory()).toEqual([])
  })

  it('a write that fails is logged and never thrown: the response it records still reaches the user', async () => {
    // userData under a regular file: nothing can be created there.
    const blocker = join(base, 'blocker')
    writeFileSync(blocker, 'not a folder')
    userData.path = join(blocker, 'userData')
    expect(() => appendHistory(entry('late'))).not.toThrow()
    expect(appendHistory(entry('late2'))[0].id).toBe('late2')
    expect(() => clearHistory()).not.toThrow()
    await flushHistory()
    expect(logged.calls.length).toBeGreaterThanOrEqual(3)
    expect(logged.calls[0][0]).toBe('history')
  })
})
