/**
 * What Send puts on the wire, checked on the real network stack (a loopback
 * server records every request).
 */
import { resolve } from 'node:path'
import { expect, openCollection, openRequest, responsePanel, rm, test } from './fixtures'
import { envFile, pathOf, requestFile, startLoopback, writeCollection, type Loopback } from './loopback'

const wire = test.extend<{ srv: Loopback }>({
  // eslint-disable-next-line no-empty-pattern
  srv: async ({}, use) => {
    const srv = await startLoopback()
    await use(srv)
    await srv.close()
  }
})

/** Click Send on the open request and wait until it answered or failed. */
async function send(page: import('@playwright/test').Page): Promise<string> {
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  const status = responsePanel(page).locator('.resp-status')
  await expect(status).toBeVisible()
  return (await responsePanel(page).innerText()).replace(/\s+/g, ' ').slice(0, 160)
}

wire('a URL typed without a scheme is sent over http://', async ({ tiger, srv }) => {
  const dir = writeCollection({
    'ip.tiger': requestFile('By address', 'get', `127.0.0.1:${srv.port}/by-address`),
    'host.tiger': requestFile('By name', 'get', `localhost:${srv.port}/by-name`)
  })
  try {
    const { page } = tiger
    await openCollection(tiger, dir)
    await openRequest(page, 'GET', 'By address')
    const first = await send(page)
    await openRequest(page, 'GET', 'By name')
    const second = await send(page)
    expect(srv.requests.map((r) => r.url), `${first} | ${second}`).toEqual(['/by-address', '/by-name'])
  } finally {
    rm(resolve(dir, '..'))
  }
})

wire('every Send reaches the server, even when the response says it may be cached', async ({ tiger }) => {
  let hits = 0
  const srv = await startLoopback((req, res) => {
    if (pathOf(req) !== '/cacheable') return false
    hits++
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' })
    res.end(JSON.stringify({ hit: hits }))
    return true
  })
  const dir = writeCollection({ 'environments/dev.tiger': envFile(srv.url), 'c.tiger': requestFile('Cacheable', 'get', '{{baseUrl}}/cacheable') })
  try {
    const { page } = tiger
    await openCollection(tiger, dir)
    await openRequest(page, 'GET', 'Cacheable')
    await send(page)
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(responsePanel(page)).toContainText('"hit": 2')
    expect(hits).toBe(2)
  } finally {
    await srv.close()
    rm(resolve(dir, '..'))
  }
})
