/**
 * "Save to a folder": when an import cannot be saved by itself, it stays in
 * memory, flagged Not saved, closing the window warns about it by name, and
 * the import report saves it to a folder the user picks. A folder with files
 * in it is never written over: Tiger offers a subfolder named after the
 * collection. After a relaunch the collection opens from that folder.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeTiger, expect, launchTiger, responseStatus, rm, test } from './fixtures'

function postmanExport(baseUrl: string): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), 'tiger-e2e-pm-'))
  const file = join(dir, 'shop.postman_collection.json')
  writeFileSync(
    file,
    JSON.stringify({
      info: { name: 'Saved Shop', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      variable: [{ key: 'baseUrl', value: baseUrl }],
      item: [
        { name: 'Health', request: { method: 'GET', url: '{{baseUrl}}/posts/1' } },
        {
          name: 'Posts',
          item: [{ name: 'Get post 7', request: { method: 'GET', url: '{{baseUrl}}/posts/7' } }]
        }
      ]
    })
  )
  return { dir, file }
}

test('an import that stayed in memory is saved to a picked folder and reopens after a relaunch', async ({
  tiger,
  server,
  userDataDir
}) => {
  const { page, app } = tiger
  const exported = postmanExport(server.url)
  // The folder the user picks already holds a file of theirs.
  const target = mkdtempSync(join(tmpdir(), 'tiger-e2e-target-'))
  writeFileSync(join(target, 'README.md'), 'mine')
  const root = join(target, 'Saved Shop')
  // A file where Tiger saves imports by itself: that save fails, so the
  // import stays in memory (a full or read-only disk in real life).
  writeFileSync(join(userDataDir, 'Collections'), '')
  try {
    // The first open dialog picks the export, the second the target folder.
    // Message boxes are recorded and answered: Keep Editing, then Create "Saved Shop".
    await app.evaluate(({ dialog }, [file, folder]) => {
      const picks = [file, folder]
      const answers = [1, 0]
      const g = globalThis as unknown as { boxes: { message: string; detail?: string; buttons?: string[] }[] }
      g.boxes = []
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picks.shift()!] })) as typeof dialog.showOpenDialog
      dialog.showMessageBox = (async (...args: unknown[]) => {
        const options = args.at(-1) as { message: string; detail?: string; buttons?: string[] }
        g.boxes.push({ message: options.message, detail: options.detail, buttons: options.buttons })
        return { response: answers.shift() ?? 1, checkboxChecked: false }
      }) as typeof dialog.showMessageBox
    }, [exported.file, target])
    const boxes = () =>
      app.evaluate(() => (globalThis as unknown as { boxes: { message: string; detail?: string; buttons?: string[] }[] }).boxes)

    await page.getByRole('navigation', { name: 'Collections' }).getByRole('button', { name: 'Import', exact: true }).click()
    await page.getByRole('button', { name: /^Postman A \.json file/ }).click()

    const report = page.getByRole('dialog').filter({ hasText: 'Saved Shop' })
    await expect(report).toContainText('only lives in memory')
    const save = report.getByRole('button', { name: 'Save to a folder', exact: true })
    await expect(save).toBeFocused()
    await expect(page.locator('.sidebar .unsaved-chip')).toHaveText('Not saved')

    // Closing the window now names the import and keeps it open on Keep Editing.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
    await expect.poll(async () => (await boxes()).length).toBe(1)
    const [warning] = await boxes()
    expect(warning.message).toBe('An imported collection is not saved')
    expect(warning.detail).toContain('Saved Shop')
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)

    await save.click()
    // The picked folder is not empty: Tiger asks, and saves into a new subfolder.
    await expect.poll(async () => (await boxes()).length).toBe(2)
    expect((await boxes())[1].buttons?.[0]).toBe('Create "Saved Shop"')
    await expect.poll(() => existsSync(join(root, 'Posts', 'Get post 7.tiger'))).toBe(true)
    expect(existsSync(join(root, 'Health.tiger'))).toBe(true)
    expect(existsSync(join(root, 'environments', 'Saved Shop variables.tiger'))).toBe(true)
    expect(readdirSync(target).sort()).toEqual(['README.md', 'Saved Shop'])
    expect(readFileSync(join(target, 'README.md'), 'utf8')).toBe('mine')
    await expect(page.locator('.sidebar .unsaved-chip')).toHaveCount(0)
  } finally {
    rm(exported.dir)
  }

  // Relaunch on the same profile: the collection opens from the picked folder.
  await closeTiger(tiger)
  const again = await launchTiger(userDataDir)
  try {
    const col = again.page.getByRole('treeitem', { name: 'Saved Shop', exact: true })
    await expect(col).toBeVisible()
    await expect(again.page.locator('.sidebar .unsaved-chip')).toHaveCount(0)
    await expect(again.page.getByRole('treeitem', { name: 'GET Health', exact: true })).toBeVisible()
    await again.page.getByRole('treeitem', { name: 'GET Health', exact: true }).click()
    await again.page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(responseStatus(again.page)).toContainText('200 OK')
    await expect.poll(() => server.requests.map((r) => r.url)).toContain('/posts/1')
    expect(again.errors).toEqual([])
  } finally {
    await closeTiger(again)
    rm(target)
  }
})
