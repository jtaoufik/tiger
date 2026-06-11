/**
 * Persistent cookie jar. Minimal but real: domain-suffix and path-prefix
 * matching, expiry, survives restarts in userData/cookies.json.
 *
 * Pure logic lives in src/core/cookieStore.ts; this module only handles
 * load/persist/cache and the Electron userData path.
 */

import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { matchCookies, upsertCookies } from '../core/cookieStore'
import type { StoredCookie } from '../core/cookieStore'

export type { StoredCookie }

let cache: StoredCookie[] | null = null

function jarPath(): string {
  return join(app.getPath('userData'), 'cookies.json')
}

function load(): StoredCookie[] {
  if (cache) return cache
  try {
    cache = JSON.parse(readFileSync(jarPath(), 'utf8')) as StoredCookie[]
  } catch {
    cache = []
  }
  return cache!
}

function persist(): void {
  try {
    writeFileSync(jarPath(), JSON.stringify(cache ?? [], null, 2), 'utf8')
  } catch {
    /* disk trouble must not break sends */
  }
}

export function storeCookies(url: string, setCookieValues: string[]): void {
  if (!setCookieValues.length) return
  cache = upsertCookies(load(), url, setCookieValues, Date.now())
  persist()
}

export function cookieHeaderFor(url: string): string {
  return matchCookies(load(), url, Date.now())
}

export function clearCookies(): void {
  cache = []
  persist()
}

export function listCookies(): StoredCookie[] {
  const now = Date.now()
  return load().filter((c) => c.expires === undefined || c.expires > now)
}
