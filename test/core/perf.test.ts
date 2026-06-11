import { describe, expect, it } from 'vitest'
import { computeStats, percentile, runPool } from '../../src/core/perf'

describe('percentile', () => {
  it('computes p50 and p95 on sorted data', () => {
    const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    expect(percentile(sorted, 50)).toBe(50)
    expect(percentile(sorted, 95)).toBe(100)
  })

  it('handles empty and single-element inputs', () => {
    expect(percentile([], 50)).toBe(0)
    expect(percentile([42], 95)).toBe(42)
  })
})

describe('computeStats', () => {
  it('summarizes timings', () => {
    const stats = computeStats([30, 10, 20], 2)
    expect(stats).toEqual({ count: 3, okCount: 2, min: 10, max: 30, avg: 20, p50: 20, p95: 30 })
  })
})

describe('runPool', () => {
  it('runs all jobs and respects concurrency', async () => {
    let inFlight = 0
    let peak = 0
    const results = await runPool(20, 5, async (i) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 2))
      inFlight--
      return i * 2
    })
    expect(results).toHaveLength(20)
    expect(results[7]).toBe(14)
    expect(peak).toBeLessThanOrEqual(5)
  })

  it('reports progress', async () => {
    const seen: number[] = []
    await runPool(4, 2, async () => 1, (d) => seen.push(d))
    expect(seen).toEqual([1, 2, 3, 4])
  })
})
