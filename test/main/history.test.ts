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

import { appendHistory, clearHistory, readHistory, type HistoryEntry } from '../../src/main/history'

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
  it('appends newest first, keeps 200 entries, and reads back what it wrote', () => {
    clearHistory()
    for (let i = 0; i < 205; i++) appendHistory(entry(`e${i}`))
    const read = readHistory()
    expect(read).toHaveLength(200)
    expect(read[0].id).toBe('e204')
    expect(JSON.parse(readFileSync(join(base, 'history.json'), 'utf8'))).toHaveLength(200)
  })

  it('a damaged file reads as empty instead of throwing', () => {
    writeFileSync(join(base, 'history.json'), '[{"id": trunc')
    expect(readHistory()).toEqual([])
  })

  it('a write that fails is logged and never thrown: the response it records still reaches the user', () => {
    // userData under a regular file: nothing can be created there.
    const blocker = join(base, 'blocker')
    writeFileSync(blocker, 'not a folder')
    userData.path = join(blocker, 'userData')
    expect(() => appendHistory(entry('late'))).not.toThrow()
    expect(appendHistory(entry('late2'))[0].id).toBe('late2')
    expect(() => clearHistory()).not.toThrow()
    expect(logged.calls.length).toBeGreaterThanOrEqual(3)
    expect(logged.calls[0][0]).toBe('history')
  })
})
