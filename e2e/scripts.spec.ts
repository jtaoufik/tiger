/**
 * Imported Postman scripts run in the real app, inside the isolated script host:
 * a Postman v2.1 collection is imported through the Import dialog, its
 * pre-request script adds a header with pm.request.headers.add, and its test
 * script uses pm.test / pm.expect / pm.response.json(). Everything is driven
 * through real UI events (no CDP evaluate in the page, which would bypass the
 * app window's CSP) and the header is asserted on the local server's side.
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, responsePanel, responseStatus, rm, test } from './fixtures'

function postmanExport(baseUrl: string): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), 'tiger-e2e-pm-'))
  const file = join(dir, 'shop.postman_collection.json')
  const collection = {
    info: {
      name: 'PM Shop',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    variable: [
      { key: 'baseUrl', value: baseUrl },
      { key: 'sig', value: 'sig-from-collection' }
    ],
    item: [
      {
        name: 'Get post 7',
        event: [
          {
            listen: 'prerequest',
            script: {
              type: 'text/javascript',
              exec: [
                "pm.request.headers.add({ key: 'X-Pm-Sig', value: pm.collectionVariables.get('sig') + '-' + pm.request.method })",
                "pm.environment.set('preRan', 'yes')"
              ]
            }
          },
          {
            listen: 'test',
            script: {
              type: 'text/javascript',
              exec: [
                "pm.test('status is 200', function () { pm.response.to.have.status(200) })",
                "pm.test('json id is 7', function () { pm.expect(pm.response.json().id).to.equal('7') })",
                "pm.test('pre-request ran first', function () { pm.expect(pm.environment.get('preRan')).to.eql('yes') })"
              ]
            }
          }
        ],
        request: {
          method: 'GET',
          header: [{ key: 'Accept', value: 'application/json' }],
          url: {
            raw: '{{baseUrl}}/posts/7',
            host: ['{{baseUrl}}'],
            path: ['posts', '7']
          }
        }
      }
    ]
  }
  writeFileSync(file, JSON.stringify(collection, null, 2))
  return { dir, file }
}

test('imported Postman scripts: pm.request.headers.add reaches the server and pm.test passes', async ({
  tiger,
  server
}) => {
  const { page, app } = tiger
  const exported = postmanExport(server.url)
  try {
    // The native picker returns our export; the Import dialog, the IPC and the
    // Postman importer are the real ones.
    await app.evaluate(({ dialog }, picked) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [picked]
      })) as typeof dialog.showOpenDialog
    }, exported.file)

    await page
      .getByRole('navigation', { name: 'Collections' })
      .getByRole('button', { name: 'Import', exact: true })
      .click()
    await page.getByRole('button', { name: /^Postman A \.json file/ }).click()

    // The import report comes up; close it.
    const report = page.getByRole('dialog').filter({ hasText: 'PM Shop' })
    await expect(report).toBeVisible()
    await report.getByRole('button', { name: /^(Done|Close|OK|Got it)/ }).first().click()
    await expect(report).toHaveCount(0)

    // The first imported request is open.
    await expect(page.getByRole('textbox', { name: 'Request name' })).toHaveValue('Get post 7')

    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(responseStatus(page)).toContainText('200 OK')

    // The server saw the header the pre-request script added in the sandbox.
    await expect.poll(() => server.requests.length).toBe(1)
    expect(server.requests[0]).toMatchObject({ method: 'GET', url: '/posts/7' })
    expect(server.requests[0].headers['x-pm-sig']).toBe('sig-from-collection-GET')
    expect(server.requests[0].headers.accept).toBe('application/json')

    // The pm.test results show in the response panel.
    const panel = responsePanel(page)
    const testsTab = panel.getByRole('tab', { name: 'Tests, 3 of 3 passed' })
    await expect(testsTab).toBeVisible()
    await testsTab.click()
    for (const name of ['status is 200', 'json id is 7', 'pre-request ran first']) {
      await expect(panel.getByText(name, { exact: true })).toBeVisible()
    }
    expect(tiger.errors).toEqual([])
  } finally {
    rm(exported.dir)
  }
})
