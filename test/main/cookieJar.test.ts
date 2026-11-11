// @vitest-environment node
/**
 * The jar file is written by Tiger but lives in the profile folder, where it
 * can be hand-edited or damaged. Whatever it holds, sends must keep working.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = vi.hoisted(() => ({ path: '' }))
const logged = vi.hoisted(() => ({ calls: [] as unknown[][] }))
vi.mock('electron', () => ({
  app: { getPath: () => userData.path },
  session: { defaultSession: { clearStorageData: async () => undefined } }
}))
vi.mock('../../src/main/resilience', () => ({
  logMainError: (...args: unknown[]) => {
    logged.calls.push(args)
  }
}))

import { attachCookieStore, cookieHeaderFor, listCookies } from '../../src/main/cookieJar'

interface FakeCookie {
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  session: boolean
  hostOnly: boolean
  expirationDate?: number
}

/** The slice of Electron's Session cookie API the jar uses. */
function fakeSession() {
  const store: FakeCookie[] = []
  const cookies = {
    async set(d: { url: string; name: string; value: string; path?: string; domain?: string; secure?: boolean; expirationDate?: number }) {
      store.push({
        name: d.name,
        value: d.value,
        domain: d.domain ?? new URL(d.url).hostname,
        path: d.path ?? '/',
        secure: !!d.secure,
        session: d.expirationDate === undefined,
        hostOnly: !d.domain,
        ...(d.expirationDate !== undefined ? { expirationDate: d.expirationDate } : {})
      })
    },
    async get(filter: { url?: string }) {
      if (!filter.url) return store
      const host = new URL(filter.url).hostname
      return store.filter((c) => c.domain === host)
    },
    async remove() {},
    on() {}
  }
  return { cookies, store }
}

let base = ''
beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'tiger-jar-'))
})
afterAll(() => {
  rmSync(base, { recursive: true, force: true })
})
beforeEach(() => {
  userData.path = base
  logged.calls = []
})

const good = { domain: 'api.test', path: '/', name: 'sid', value: 'abc', hostOnly: true }

describe('attachCookieStore with a damaged cookies.json', () => {
  it('skips a null entry and one missing its path, keeps the valid cookie, and resolves', async () => {
    writeFileSync(
      join(base, 'cookies.json'),
      JSON.stringify([null, { name: 'nopath', domain: 'api.test', value: 'x' }, 'text', good])
    )
    const ses = fakeSession()
    await expect(attachCookieStore(ses as never)).resolves.toBeUndefined()
    expect(ses.store.map((c) => c.name)).toEqual(['sid'])
    expect(listCookies().map((c) => c.name)).toEqual(['sid'])
    expect(await cookieHeaderFor('http://api.test/users')).toBe('sid=abc')
  })

  it('a file that is not JSON, or not an array, leaves an empty jar', async () => {
    writeFileSync(join(base, 'cookies.json'), '{"not": "an array"')
    const ses = fakeSession()
    await attachCookieStore(ses as never)
    expect(listCookies()).toEqual([])
    writeFileSync(join(base, 'cookies.json'), '{"not": "an array"}')
    await attachCookieStore(fakeSession() as never)
    expect(listCookies()).toEqual([])
  })

  it('an expired entry is not seeded', async () => {
    writeFileSync(join(base, 'cookies.json'), JSON.stringify([{ ...good, name: 'old', expires: 1 }, good]))
    const ses = fakeSession()
    await attachCookieStore(ses as never)
    expect(ses.store.map((c) => c.name)).toEqual(['sid'])
    expect(listCookies().map((c) => c.name)).toEqual(['sid'])
  })
})
