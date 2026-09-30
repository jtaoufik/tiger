/**
 * Opening a 2,000-request / 200-folder collection from disk: the payload must
 * be complete and correctly ordered, and the read must stay well inside a
 * budget (it runs in the main process, which also serves every other IPC).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readCollection, readOpenedCollection } from '../../src/main/collection'
import { LARGE_REQUESTS, largeRequests, writeLargeCollection } from '../fixtures/largeCollection'

let root = ''

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'tiger-large-'))
  await writeLargeCollection(root)
}, 60_000)

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('readOpenedCollection on a large collection', () => {
  it('reads every request with its folder, sorted by folder then name', { timeout: 30_000 }, async () => {
    const payload = await readOpenedCollection(root)
    expect(payload.requests).toHaveLength(LARGE_REQUESTS)
    const expected = largeRequests().map((r) => `${r.folderPath.join('/')}|${r.name}|${r.method}`)
    expect(payload.requests.map((r) => `${r.folder.join('/')}|${r.name}|${r.method}`)).toEqual(expected)
  })

  it('stays within budget', { timeout: 60_000 }, async () => {
    await readCollection(root) // warm the OS file cache
    const runs: number[] = []
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now()
      await readCollection(root)
      runs.push(performance.now() - t0)
    }
    const median = runs.sort((a, b) => a - b)[2]
    if (process.env.TIGER_PERF_REPORT) {
      console.log(`[perf] readCollection 2,000 files (warm cache, median of 5): ${median.toFixed(1)} ms`)
    }
    // Coarse sanity budget (runs next to the whole suite on shared CI
    // runners); the A/B numbers in the PR come from an interleaved benchmark.
    expect(median).toBeLessThan(3000)
  })
})
