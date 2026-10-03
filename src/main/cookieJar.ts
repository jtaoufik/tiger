/**
 * Persistent cookie jar. While the app runs, the jar lives in the cookie
 * store of the Chromium session that sends requests (see http.ts): Chromium
 * applies the cookie rules, also to redirect responses, whose Set-Cookie it
 * never hands over. Requests sent through Node read and write the same store.
 * userData/cookies.json keeps the jar across restarts, session cookies too.
 *
 * Nothing else adds cookies to a request: with the jar off, or for a request
 * that writes its own Cookie header, Chromium's store is left out entirely.
 *
 * Pure Set-Cookie parsing lives in src/core/cookieStore.ts.
 */

import { app, session, type Cookie, type CookiesSetDetails, type Session } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseResponseCookies } from '../core/cookieStore'
import type { StoredCookie } from '../core/cookieStore'

export type { StoredCookie }

/** The session whose cookie store holds the jar, once http.ts has created it. */
let jarSession: Session | null = null
/** The jar as last persisted, kept in step with the store's change events. */
let snapshot: StoredCookie[] = []
/** Seeding the store at startup, then any Clear cookies in progress. */
let ready: Promise<void> = Promise.resolve()

function jarPath(): string {
  return join(app.getPath('userData'), 'cookies.json')
}

function readJarFile(): StoredCookie[] {
  try {
    const data = JSON.parse(readFileSync(jarPath(), 'utf8'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function persist(): void {
  try {
    writeFileSync(jarPath(), JSON.stringify(snapshot, null, 2), 'utf8')
  } catch {
    /* disk trouble must not break sends */
  }
}

const sameCookie = (a: StoredCookie, b: StoredCookie): boolean =>
  a.name === b.name && a.domain === b.domain && a.path === b.path && !a.hostOnly === !b.hostOnly

function fromChromium(c: Cookie): StoredCookie {
  const domain = (c.domain ?? '').replace(/^\./, '')
  return {
    domain,
    path: c.path ?? '/',
    name: c.name,
    value: c.value,
    ...(c.session || c.expirationDate === undefined ? {} : { expires: Math.round(c.expirationDate * 1000) }),
    hostOnly: c.hostOnly ?? !(c.domain ?? '').startsWith('.'),
    ...(c.secure ? { secure: true } : {})
  }
}

/** The URL a stored cookie belongs to, as Electron's cookie API wants it. */
function cookieUrl(c: StoredCookie): string {
  return `${c.secure ? 'https' : 'http'}://${c.domain}${c.path.startsWith('/') ? c.path : '/'}`
}

function toChromium(c: StoredCookie): CookiesSetDetails {
  return {
    url: cookieUrl(c),
    name: c.name,
    value: c.value,
    path: c.path,
    // No domain = a host-only cookie; a domain also matches its subdomains.
    ...(c.hostOnly ? {} : { domain: c.domain }),
    secure: !!c.secure,
    ...(c.expires !== undefined ? { expirationDate: c.expires / 1000 } : {})
  }
}

/**
 * Make `ses`'s cookie store the jar: fill it from cookies.json, then keep the
 * file in step with every change Chromium makes (responses, expiry, clears).
 */
export function attachCookieStore(ses: Session): Promise<void> {
  jarSession = ses
  snapshot = readJarFile().filter((c) => c.expires === undefined || c.expires > Date.now())
  const seeded = Promise.all(snapshot.map((c) => ses.cookies.set(toChromium(c)).catch(() => undefined)))
  ready = seeded
    .then(async () => {
      // What Chromium accepted, in its own terms, is the jar from now on.
      snapshot = (await ses.cookies.get({})).map(fromChromium)
    })
    .catch(() => undefined)
    .then(() => {
      ses.cookies.on('changed', (_event, cookie, cause, removed) => {
        const changed = fromChromium(cookie)
        snapshot = snapshot.filter((c) => !sameCookie(c, changed))
        // An overwrite is a removal followed by the new cookie's insertion.
        if (!removed) snapshot.push(changed)
        else if (cause === 'overwrite') return
        persist()
      })
    })
  return ready
}

/** Resolves once the jar is ready: filled at startup and not being cleared. */
export function cookiesSettled(): Promise<void> {
  return ready
}

/** The Cookie header the jar holds for `url` (Node send path). */
export async function cookieHeaderFor(url: string): Promise<string> {
  if (!jarSession) return ''
  await ready
  const cookies = await jarSession.cookies.get({ url })
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ')
}

/** Store the Set-Cookie headers of a response to `url` (Node send path, own Cookie header). */
export async function storeCookies(url: string, setCookieValues: string[]): Promise<void> {
  if (!jarSession || !setCookieValues.length) return
  await ready
  const cookies = jarSession.cookies
  await Promise.all(
    parseResponseCookies(url, setCookieValues, Date.now()).map(({ cookie, expired }) =>
      (expired ? cookies.remove(cookieUrl(cookie), cookie.name) : cookies.set(toChromium(cookie))).catch(() => undefined)
    )
  )
}

/**
 * Empty the jar: its store, its file, and the app's default session, where
 * earlier versions let Chromium keep (and replay) cookies of its own.
 */
export function clearCookies(): Promise<void> {
  snapshot = []
  persist()
  const sessions = [session.defaultSession, ...(jarSession ? [jarSession] : [])]
  // After any filling in progress, so nothing lands in the store once it is empty.
  ready = ready
    .then(() => Promise.all(sessions.map((ses) => ses.clearStorageData({ storages: ['cookies'] }))))
    .catch(() => undefined)
    .then(() => {
      snapshot = []
      persist()
    })
  return ready
}

export function listCookies(): StoredCookie[] {
  const now = Date.now()
  return snapshot.filter((c) => c.expires === undefined || c.expires > now)
}
