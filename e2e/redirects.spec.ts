/**
 * Settings > Follow redirects and Max redirects, on the real network stack.
 */
import { resolve } from 'node:path'
import { closeTiger, expect, launchTiger, makeUserDataDir, openCollection, openRequest, responsePanel, rm, test } from './fixtures'
import { envFile, pathOf, requestFile, startLoopback, writeCollection } from './loopback'

function redirectServer() {
  return startLoopback((req, res) => {
    const path = pathOf(req)
    if (path === '/r1' || path === '/r2') {
      res.writeHead(302, { Location: path === '/r1' ? '/r2' : '/final', 'Content-Type': 'text/plain' })
      res.end(`Found. Redirecting from ${path}`)
      return true
    }
    return false
  })
}

for (const [label, settings, expected] of [
  [
    'with Follow redirects off, the 302 is shown with its Location and nothing more is requested',
    { followRedirects: false },
    { status: '302', location: '/r2', seen: ['/r1'] }
  ],
  [
    'Max redirects 1 follows one redirect, then shows the next 302',
    { maxRedirects: 1 },
    { status: '302', location: '/final', seen: ['/r1', '/r2'] }
  ],
  [
    'by default, redirects are followed to the final answer',
    {},
    { status: '200', location: null, seen: ['/r1', '/r2', '/final'] }
  ]
] as const) {
  test(label, async () => {
    const srv = await redirectServer()
    const dir = writeCollection({
      'environments/dev.tiger': envFile(srv.url),
      'r1.tiger': requestFile('Redirect', 'get', '{{baseUrl}}/r1')
    })
    const ud = makeUserDataDir(settings)
    const t = await launchTiger(ud)
    try {
      await openCollection(t, dir)
      await openRequest(t.page, 'GET', 'Redirect')
      await t.page.getByRole('button', { name: 'Send', exact: true }).click()
      const status = responsePanel(t.page).locator('.resp-status')
      await expect(status).toBeVisible()
      const shown = (await responsePanel(t.page).innerText()).replace(/\s+/g, ' ').trim()
      let location: string | null = null
      if (/^\d{3}\b/.test((await status.innerText()).trim())) {
        await responsePanel(t.page).getByRole('tab', { name: /^Headers/ }).click()
        const headers = (await responsePanel(t.page).innerText()).replace(/\s+/g, ' ')
        location = /location (\S+)/i.exec(headers)?.[1] ?? null
      }
      const code = /^\d{3}/.exec((await status.innerText()).trim())?.[0] ?? shown.slice(0, 120)
      expect({ status: code, location, seen: srv.requests.map(pathOf) }).toEqual(expected)
    } finally {
      await closeTiger(t)
      await srv.close()
      rm(ud)
      rm(resolve(dir, '..'))
    }
  })
}
