import type { Page } from '@playwright/test'
import { MOD, collectionTree, expect, openCollection, responsePanel, responseStatus, test } from './fixtures'

/** Role and tree key of whatever has keyboard focus. */
function focused(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    return {
      role: el?.getAttribute('role') ?? el?.tagName.toLowerCase() ?? '',
      key: el?.dataset.nodeKey ?? '',
      label: el?.getAttribute('aria-label') ?? ''
    }
  })
}

/** Press `key` until `done()` holds; bounded so a regression fails instead of spinning. */
async function pressUntil(page: Page, key: string, done: () => Promise<boolean>, max = 60): Promise<void> {
  for (let i = 0; i < max && !(await done()); i++) await page.keyboard.press(key)
  expect(await done()).toBe(true)
}

test('keyboard only: skip link, arrow through the tree, Enter opens, Mod+Enter sends', async ({ tiger, collection, server }) => {
  const { page } = tiger
  await openCollection(tiger, collection)

  // Reload: the session (open collection + tabs) is restored and focus starts
  // at the top of a fresh document, exactly like a keyboard user's launch.
  await page.reload()
  await expect(collectionTree(page)).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Request URL' })).toBeVisible()

  // The first Tab stop is the skip link; Enter on it lands in the URL field.
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to request URL' })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('textbox', { name: 'Request URL' })).toBeFocused()

  // Back up to the environment picker and choose "demo" by typing.
  const envPicker = page.getByRole('combobox', { name: 'Active environment' })
  await pressUntil(page, 'Shift+Tab', async () => (await focused(page)).label === 'Active environment')
  await page.keyboard.type('d')
  await expect(envPicker.locator('option:checked')).toHaveText('demo')

  // Forward into the sidebar tree (a single roving Tab stop).
  await pressUntil(page, 'Tab', async () => (await focused(page)).role === 'treeitem')

  // Arrow down, one row at a time, to "List posts".
  const target = collectionTree(page).getByRole('treeitem', { name: 'GET List posts', exact: true })
  const targetKey = await target.getAttribute('data-node-key')
  for (let i = 0; i < 40; i++) {
    const before = (await focused(page)).key
    if (before === targetKey) break
    await page.keyboard.press('ArrowDown')
    // Focus follows React's re-render of the roving tabindex: wait for it.
    await expect.poll(async () => (await focused(page)).key).not.toBe(before)
  }
  await expect(target).toBeFocused()

  // Enter opens it in a tab.
  await page.keyboard.press('Enter')
  await expect(page.getByRole('tab', { name: 'GET List posts', selected: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Request URL' })).toHaveValue('{{baseUrl}}/posts')
  expect(server.requests).toHaveLength(0)

  // Cmd+Enter (macOS) / Ctrl+Enter (Windows, Linux) sends it.
  await page.keyboard.press(`${MOD}+Enter`)
  await expect(responseStatus(page)).toContainText('200 OK')
  await expect(responsePanel(page)).toContainText('e2e-post-title')
  expect(server.requests.map((r) => r.url)).toEqual(['/posts?userId=1'])
  expect(tiger.errors).toEqual([])
})
