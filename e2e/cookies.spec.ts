/**
 * The cookie jar on the real network stack: Tiger's jar (Settings >
 * Persistent cookie jar) is the only place cookies come from, also for
 * cookies set on a redirect, and "Clear cookies" really clears them.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { closeTiger, collectionTree, expect, launchTiger, makeUserDataDir, openCollection, openRequest, responseStatus, rm, test, type Tiger } from './fixtures'
import { envFile, pathOf, requestFile, startLoopback, writeCollection, type Loopback } from './loopback'

function cookieServer(): Promise<Loopback> {
  return startLoopback((req, res) => {
    const path = pathOf(req)
    if (path === '/login') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': ['sid=abc; Path=/', 'strict=1; Path=/; SameSite=Strict']
      })
      res.end('{"login":true}')
      return true
    }
    if (path === '/form-login') {
      // A login form: 302 to the home page with the session cookie.
      res.writeHead(302, { Location: '/home', 'Set-Cookie': 'session=from-redirect; Path=/' })
      res.end()
      return true
    }
    return false
  })
}

function collection(baseUrl: string): string {
  return writeCollection({
    'environments/dev.tiger': envFile(baseUrl),
    '1-login.tiger': requestFile('Login', 'get', '{{baseUrl}}/login'),
    '2-me.tiger': requestFile('Me', 'get', '{{baseUrl}}/me'),
    '3-form-login.tiger': requestFile('Form login', 'post', '{{baseUrl}}/form-login'),
    '4-own-cookie.tiger': requestFile('Own cookie', 'get', '{{baseUrl}}/own', 'headers {\n  Cookie: mine=1\n}\n')
  })
}

/** Send a request of the collection and return the Cookie header the server got. */
async function sendFor(t: Tiger, srv: Loopback, method: string, name: string): Promise<string | null> {
  await openRequest(t.page, method, name)
  const before = srv.requests.length
  await t.page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(responseStatus(t.page)).toContainText('200')
  expect(srv.requests.length).toBeGreaterThan(before)
  const cookie = srv.requests.at(-1)!.headers.cookie
  return cookie === undefined ? null : String(cookie).split('; ').sort().join('; ')
}

async function clearCookies(t: Tiger): Promise<void> {
  // The IPC behind Settings > Clear cookies.
  await t.page.evaluate(() => (window as unknown as { tiger: { clearCookies: () => Promise<void> } }).tiger.clearCookies())
}

test('with the jar on, a response cookie is sent next time and Clear cookies forgets it', async () => {
  const srv = await cookieServer()
  const dir = collection(srv.url)
  const ud = makeUserDataDir({ cookieJarEnabled: true })
  const t = await launchTiger(ud)
  try {
    await openCollection(t, dir)
    await sendFor(t, srv, 'GET', 'Login')
    const afterLogin = await sendFor(t, srv, 'GET', 'Me')
    await clearCookies(t)
    const afterClear = await sendFor(t, srv, 'GET', 'Me')
    expect({ afterLogin, afterClear }).toEqual({ afterLogin: 'sid=abc; strict=1', afterClear: null })
  } finally {
    await closeTiger(t)
    await srv.close()
    rm(ud)
    rm(resolve(dir, '..'))
  }
})

test('with the jar off, no cookie is kept, by Tiger or by Chromium', async () => {
  const srv = await cookieServer()
  const dir = collection(srv.url)
  const ud = makeUserDataDir({ cookieJarEnabled: false })
  const t = await launchTiger(ud)
  try {
    await openCollection(t, dir)
    await sendFor(t, srv, 'GET', 'Login')
    const afterLogin = await sendFor(t, srv, 'GET', 'Me')
    const jarFile = join(ud, 'cookies.json')
    const stored = existsSync(jarFile) ? readFileSync(jarFile, 'utf8') : ''
    expect({ afterLogin, storedSid: stored.includes('abc') }).toEqual({ afterLogin: null, storedSid: false })
  } finally {
    await closeTiger(t)
    await srv.close()
    rm(ud)
    rm(resolve(dir, '..'))
  }
})

test('a cookie set by a redirect is sent along the redirect and kept for the next request', async () => {
  const srv = await cookieServer()
  const dir = collection(srv.url)
  const ud = makeUserDataDir({ cookieJarEnabled: true })
  const t = await launchTiger(ud)
  try {
    await openCollection(t, dir)
    await openRequest(t.page, 'POST', 'Form login')
    await t.page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(responseStatus(t.page)).toContainText('200')
    const home = srv.requests.find((r) => r.url === '/home')
    const later = await sendFor(t, srv, 'GET', 'Me')
    expect({ home: home?.headers.cookie ?? null, later }).toEqual({ home: 'session=from-redirect', later: 'session=from-redirect' })
  } finally {
    await closeTiger(t)
    await srv.close()
    rm(ud)
    rm(resolve(dir, '..'))
  }
})

test("a request's own Cookie header is sent as written, not replaced by the jar", async () => {
  const srv = await cookieServer()
  const dir = collection(srv.url)
  const ud = makeUserDataDir({ cookieJarEnabled: true })
  const t = await launchTiger(ud)
  try {
    await openCollection(t, dir)
    await sendFor(t, srv, 'GET', 'Login')
    expect(await sendFor(t, srv, 'GET', 'Own cookie')).toBe('mine=1')
  } finally {
    await closeTiger(t)
    await srv.close()
    rm(ud)
    rm(resolve(dir, '..'))
  }
})

test('jar cookies are still sent after a restart', async () => {
  const srv = await cookieServer()
  const dir = collection(srv.url)
  const ud = makeUserDataDir({ cookieJarEnabled: true })
  let t = await launchTiger(ud)
  try {
    await openCollection(t, dir)
    await sendFor(t, srv, 'GET', 'Login')
    await closeTiger(t)
    t = await launchTiger(ud)
    // The session normally reopens the collection; open it when it does not.
    try {
      await expect(collectionTree(t.page)).toBeVisible({ timeout: 3000 })
    } catch {
      await openCollection(t, dir)
    }
    expect(await sendFor(t, srv, 'GET', 'Me')).toBe('sid=abc; strict=1')
  } finally {
    await closeTiger(t)
    await srv.close()
    rm(ud)
    rm(resolve(dir, '..'))
  }
})
