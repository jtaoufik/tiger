#!/usr/bin/env node
/**
 * Cold-start benchmark for the built app (run `npx electron-vite build` first).
 *
 *   node scripts/perf-startup.mjs [runs=10]
 *
 * Launches Electron on out/ `runs` times with TIGER_PERF=1 TIGER_PERF_EXIT=1
 * (see src/main/perf.ts): the window is never shown, the app quits as soon as
 * the renderer reports its first contentful paint and first App frame. Uses a
 * throwaway --user-data-dir so the real profile, settings and session are
 * never touched. Prints the median of every mark, in ms from process start.
 * The first run warms the OS file cache and is discarded.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electron = require('electron')
const runs = Number(process.argv[2] ?? 10)
const userData = mkdtempSync(join(tmpdir(), 'tiger-perf-'))

function once() {
  return new Promise((resolve, reject) => {
    const child = spawn(electron, ['.', `--user-data-dir=${userData}`], {
      env: { ...process.env, TIGER_PERF: '1', TIGER_PERF_EXIT: '1', ELECTRON_RENDERER_URL: '' },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let out = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`timed out; output:\n${out}`))
    }, 30000)
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    child.on('exit', () => {
      clearTimeout(timer)
      const line = out.split('\n').find((l) => l.startsWith('[tiger:perf] '))
      if (!line) return reject(new Error(`no perf line; output:\n${out}`))
      resolve(JSON.parse(line.slice('[tiger:perf] '.length)))
    })
  })
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

try {
  await once() // warm-up, discarded
  const samples = []
  for (let i = 0; i < runs; i++) samples.push(await once())
  const keys = Object.keys(samples[0])
  const result = {}
  for (const k of keys) {
    const xs = samples.map((s) => s[k]).filter((v) => typeof v === 'number')
    result[k] = { median: Math.round(median(xs)), min: Math.round(Math.min(...xs)), max: Math.round(Math.max(...xs)) }
  }
  const fcp = samples.map((s) => s['renderer:fcp'] - s['main:ready'])
  const rendered = samples.map((s) => s['renderer:app-rendered'] - s['main:ready'])
  console.log(`runs: ${runs}`)
  console.table(result)
  console.log(`app ready -> first contentful paint: median ${Math.round(median(fcp))} ms`)
  console.log(`app ready -> first App frame:        median ${Math.round(median(rendered))} ms`)
} finally {
  rmSync(userData, { recursive: true, force: true })
}
