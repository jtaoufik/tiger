/**
 * Startup timing marks, dev only. Records wall-clock milestones from process
 * start to the renderer's first contentful paint and logs one summary line.
 *
 * Enabled when running unpackaged (`npm run dev`, `electron .`) or with
 * TIGER_PERF=1. Packaged builds pay one boolean check per mark and nothing
 * else. TIGER_PERF_EXIT=1 quits right after the summary so scripts can
 * measure cold starts in a loop (see scripts/perf-startup.mjs).
 *
 * Times are absolute (performance.timeOrigin + now) so marks taken in the
 * renderer process line up with the main-process ones.
 */
import { app } from 'electron'
import { performance } from 'node:perf_hooks'

export const perfEnabled = process.env.TIGER_PERF === '1' || !app.isPackaged
export const perfExit = process.env.TIGER_PERF_EXIT === '1'

const now = (): number => performance.timeOrigin + performance.now()
const origin = performance.timeOrigin
const marks: Record<string, number> = {}

/** Record a main-process milestone (first call per name wins). */
export function perfMark(name: string, at: number = now()): void {
  if (!perfEnabled || name in marks) return
  marks[name] = at
}

/** The renderer milestones that complete a startup trace. */
const FINAL = ['renderer:fcp', 'renderer:app-rendered'] as const

let reported = false

/** Record a renderer milestone (absolute ms); logs the summary once complete. */
export function perfRendererMark(name: string, at: number): void {
  if (!perfEnabled || typeof at !== 'number' || !Number.isFinite(at)) return
  perfMark(`renderer:${name}`, at)
  if (!reported && FINAL.every((k) => k in marks)) {
    reported = true
    const rel: Record<string, number> = {}
    for (const [k, v] of Object.entries(marks).sort((a, b) => a[1] - b[1])) {
      rel[k] = Math.round((v - origin) * 10) / 10
    }
    // One machine-readable line; scripts/perf-startup.mjs greps for it.
    console.log(`[tiger:perf] ${JSON.stringify(rel)}`)
    if (perfExit) setTimeout(() => app.exit(0), 50)
  }
}
