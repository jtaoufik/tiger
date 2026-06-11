/** Statistics for the performance runner. Pure and unit-tested. */

export interface PerfStats {
  count: number
  okCount: number
  min: number
  max: number
  avg: number
  p50: number
  p95: number
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, index)]
}

export function computeStats(timesMs: number[], okCount: number): PerfStats {
  const sorted = [...timesMs].sort((a, b) => a - b)
  const sum = sorted.reduce((acc, t) => acc + t, 0)
  return {
    count: sorted.length,
    okCount,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    avg: sorted.length ? Math.round(sum / sorted.length) : 0,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95)
  }
}

/** Run `total` async jobs with at most `concurrency` in flight. */
export async function runPool<T>(
  total: number,
  concurrency: number,
  job: (index: number) => Promise<T>,
  onProgress?: (done: number) => void
): Promise<T[]> {
  const results: T[] = new Array(total)
  let next = 0
  let done = 0
  async function worker(): Promise<void> {
    while (next < total) {
      const index = next++
      results[index] = await job(index)
      onProgress?.(++done)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, total)) }, worker))
  return results
}
