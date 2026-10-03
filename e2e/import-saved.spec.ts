/**
 * An import is saved as a collection folder: it is on disk right after the
 * import, Ctrl/Cmd+S writes edits to it, and it is still there, with its
 * environment, after a relaunch. Real app, real main-process writer; the
 * folder lives in the throwaway profile (TIGER_E2E keeps Documents alone).
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeTiger, expect, launchTiger, MOD, responseStatus, rm, test } from './fixtures'

function postmanExport(baseUrl: string): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), 'tiger-e2e-pm-'))
  const file = join(dir, 'shop.postman_collection.json')
  writeFileSync(
    file,
    JSON.stringify({
      info: { name: 'Saved Shop', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      variable: [{ key: 'baseUrl', value: baseUrl }],
      item: [
        {
          name: 'Posts',
          item: [{ name: 'Get post 7', request: { method: 'GET', url: '{{baseUrl}}/posts/7' } }]
        }
      ]
    })
  )
  return { dir, file }
}

test('an imported collection is saved on disk, saves edits and survives a relaunch', async ({
  tiger,
  server,
  userDataDir
}) => {
  const { page, app } = tiger
  const exported = postmanExport(server.url)
  const root = join(userDataDir, 'Collections', 'Saved Shop')
  const requestFile = join(root, 'Posts', 'Get post 7.tiger')
  try {
    await app.evaluate(({ dialog }, picked) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as typeof dialog.showOpenDialog
    }, exported.file)
    await page.getByRole('navigation', { name: 'Collections' }).getByRole('button', { name: 'Import', exact: true }).click()
    await page.getByRole('button', { name: /^Postman A \.json file/ }).click()

    const report = page.getByRole('dialog').filter({ hasText: 'Saved Shop' })
    await expect(report).toContainText('Saved in')
    await report.getByRole('button', { name: 'Done' }).click()

    // On disk at once: the request, and the collection variables as an environment.
    expect(existsSync(requestFile)).toBe(true)
    expect(existsSync(join(root, 'environments', 'Saved Shop variables.tiger'))).toBe(true)

    // Ctrl/Cmd+S writes the edit to that file (it used to do nothing on an import).
    const url = page.getByRole('textbox', { name: 'Request URL' })
    await url.fill('{{baseUrl}}/posts/8')
    await page.keyboard.press(`${MOD}+s`)
    await expect.poll(() => readFileSync(requestFile, 'utf8')).toContain('{{baseUrl}}/posts/8')
  } finally {
    rm(exported.dir)
  }

  // Relaunch on the same profile: the collection, its environment and the edit are back.
  await closeTiger(tiger)
  const again = await launchTiger(userDataDir)
  try {
    await expect(again.page.getByRole('treeitem', { name: 'Saved Shop', exact: true })).toBeVisible()
    await expect(again.page.getByRole('textbox', { name: 'Request URL' })).toHaveValue('{{baseUrl}}/posts/8')
    await again.page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(responseStatus(again.page)).toContainText('200 OK')
    await expect.poll(() => server.requests.map((r) => r.url)).toContain('/posts/8')
    expect(again.errors).toEqual([])
  } finally {
    await closeTiger(again)
  }
})
