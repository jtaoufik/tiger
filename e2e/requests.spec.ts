import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  collectionTree,
  expect,
  openCollection,
  openRequest,
  responsePanel,
  responseStatus,
  test,
  useEnvironment
} from './fixtures'

/** Every .tiger request file under `dir`, recursively. */
function tigerFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.tiger'))
    .map((e) => join(e.parentPath, e.name))
}

test('open a request, send it to the local server, see 200 OK and the body', async ({ tiger, collection, server }) => {
  const { page } = tiger
  await openCollection(tiger, collection)
  await useEnvironment(page, 'demo')
  await openRequest(page, 'GET', 'List posts')

  await page.getByRole('button', { name: 'Send', exact: true }).click()

  await expect(responseStatus(page)).toContainText('200 OK')
  await expect(responsePanel(page)).toContainText('e2e-post-title')

  // What went over the wire: env + query interpolated, headers from the file.
  expect(server.requests).toHaveLength(1)
  expect(server.requests[0]).toMatchObject({ method: 'GET', url: '/posts?userId=1' })
  expect(server.requests[0].headers.accept).toBe('application/json')
  expect(tiger.errors).toEqual([])
})

test('create a request from the New menu, rename it with F2, and it lands on disk', async ({ tiger, collection }) => {
  const { page } = tiger
  await openCollection(tiger, collection)
  await openRequest(page, 'GET', 'List posts')
  const before = new Set(tigerFiles(collection))

  await page.getByRole('navigation', { name: 'Collections' }).getByRole('button', { name: 'New', exact: true }).click()
  await page.getByRole('menu', { name: 'New' }).getByRole('menuitem', { name: 'New request' }).click()

  const created = collectionTree(page).getByRole('treeitem', { name: 'GET New request', exact: true })
  await expect(created).toBeVisible()
  await expect(page.getByRole('tab', { name: 'GET New request', selected: true })).toBeVisible()

  // Exactly one new .tiger file was written into the collection folder.
  await expect.poll(() => tigerFiles(collection).filter((f) => !before.has(f)).length).toBe(1)
  const file = tigerFiles(collection).find((f) => !before.has(f))!
  expect(file).toMatch(/[\\/]new-request-\d+\.tiger$/)

  await page.keyboard.press('F2')
  const rename = page.getByRole('textbox', { name: 'Rename New request' })
  await expect(rename).toBeFocused()
  await rename.fill('Fetch widgets')
  await rename.press('Enter')

  await expect(collectionTree(page).getByRole('treeitem', { name: 'GET Fetch widgets', exact: true })).toBeVisible()
  await expect(created).toHaveCount(0)
  await expect.poll(() => readFileSync(file, 'utf8')).toContain('name: Fetch widgets')
  expect(tiger.errors).toEqual([])
})
