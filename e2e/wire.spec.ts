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

wire('headers that Chromium keeps for itself are sent as written', async ({ tiger, srv }) => {
  test.setTimeout(120_000)
  const headers: Array<[string, string]> = [
    // Chromium refuses these from the net module (the whole send used to fail).
    ['Host', 'virtual.test'],
    ['Content-Length', '0'],
    ['Keep-Alive', 'timeout=5'],
    ['Transfer-Encoding', 'chunked'],
    ['TE', 'trailers'],
    ['Upgrade', 'h2c'],
    ['Proxy-Authorization', 'Basic eDp5'],
    ['Sec-Fetch-Mode', 'cors'],
    ['Sec-Fetch-Site', 'same-site'],
    ['Sec-Fetch-Dest', 'empty'],
    ['Referer', 'https://app.test/page'],
    // These always went out; they must keep doing so.
    ['Referer', `${srv.url}/page`],
    ['Connection', 'keep-alive'],
    ['Cookie', 'a=b'],
    ['User-Agent', 'wire-check/1.0'],
    ['Origin', 'https://app.test'],
    ['Accept-Encoding', 'gzip, deflate, br'],
    ['sec-ch-ua', '"Chromium";v="128"'],
    ['Priority', 'u=1, i'],
    ['Via', '1.1 proxy'],
    ['DNT', '1'],
    ['Access-Control-Request-Method', 'POST']
  ]
  const files: Record<string, string> = { 'environments/dev.tiger': envFile(srv.url) }
  headers.forEach(([name, value], i) => {
    files[`h${String(i).padStart(2, '0')}.tiger`] = requestFile(`H${i}`, 'get', `{{baseUrl}}/h${i}`, `headers {\n  ${name}: ${value}\n}\n`)
  })
  const dir = writeCollection(files)
  try {
    const { page } = tiger
    await openCollection(tiger, dir)
    const expected: Record<string, string> = {}
    const got: Record<string, string> = {}
    for (const [i, [name, value]] of headers.entries()) {
      await openRequest(page, 'GET', `H${i}`)
      const panel = await send(page)
      const seen = srv.requests.find((r) => r.url === `/h${i}`)
      const label = `${name}: ${value}`
      expected[label] = value
      got[label] = seen ? String(seen.headers[name.toLowerCase()] ?? '(absent)') : `NOT SENT (${panel})`
    }
    expect(got).toEqual(expected)
  } finally {
    rm(resolve(dir, '..'))
  }
})

wire('a request pasted from Chrome "Copy as cURL" is sent with its headers', async ({ tiger, srv }) => {
  const dir = writeCollection({
    'environments/dev.tiger': envFile(srv.url),
    'a.tiger': requestFile('Alpha', 'get', '{{baseUrl}}/a')
  })
  try {
    const { page } = tiger
    await openCollection(tiger, dir)
    const curl = [
      `curl '${srv.url}/v1/items?page=2' \\`,
      `  -H 'accept: application/json, text/plain, */*' \\`,
      `  -H 'authorization: Bearer abc' \\`,
      `  -H 'origin: https://app.test' \\`,
      `  -H 'priority: u=1, i' \\`,
      `  -H 'referer: https://app.test/' \\`,
      `  -H 'sec-ch-ua: "Chromium";v="128", "Not;A=Brand";v="24"' \\`,
      `  -H 'sec-ch-ua-mobile: ?0' \\`,
      `  -H 'sec-fetch-dest: empty' \\`,
      `  -H 'sec-fetch-mode: cors' \\`,
      `  -H 'sec-fetch-site: same-site' \\`,
      `  -H 'user-agent: Mozilla/5.0 (Macintosh) Chrome/128.0.0.0 Safari/537.36'`
    ].join('\n')
    await page.getByRole('navigation', { name: 'Collections' }).getByRole('button', { name: 'Import', exact: true }).click()
    await page.getByRole('button', { name: 'Paste a curl command' }).click()
    await page.getByLabel('curl command').fill(curl)
    await page.getByRole('button', { name: 'Import request' }).click()
    await expect(page.getByRole('textbox', { name: 'Request name' })).toHaveValue('Imported from curl')
    const panel = await send(page)
    const seen = srv.requests.find((r) => r.url === '/v1/items?page=2')
    expect(seen, panel).toBeDefined()
    expect(seen!.headers).toMatchObject({
      authorization: 'Bearer abc',
      referer: 'https://app.test/',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'user-agent': 'Mozilla/5.0 (Macintosh) Chrome/128.0.0.0 Safari/537.36'
    })
  } finally {
    rm(resolve(dir, '..'))
  }
})

wire('a GET with a body sends the body (Elasticsearch-style search)', async ({ tiger, srv }) => {
  const dir = writeCollection({
    'environments/dev.tiger': envFile(srv.url),
    'search.tiger': requestFile('Search', 'get', '{{baseUrl}}/_search', 'body:json {\n  {"query":{"match_all":{}}}\n}\n')
  })
  try {
    const { page } = tiger
    await openCollection(tiger, dir)
    await openRequest(page, 'GET', 'Search')
    const panel = await send(page)
    const seen = srv.requests.find((r) => r.url === '/_search')
    expect(seen, panel).toBeDefined()
    expect({ method: seen!.method, body: seen!.body, type: seen!.headers['content-type'] }).toEqual({
      method: 'GET',
      body: '{"query":{"match_all":{}}}',
      type: 'application/json'
    })
  } finally {
    rm(resolve(dir, '..'))
  }
})

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
