import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { closeTiger, expect, launchTiger, test } from './fixtures'

const theme = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.dataset.theme)

test('dark theme toggle persists across a relaunch', async ({ tiger, userDataDir }) => {
  const { page } = tiger
  // Seeded as light, so the OS appearance of the runner cannot fake a pass.
  await expect.poll(() => theme(page)).toBe('light')

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const appearance = page.getByRole('group', { name: 'Appearance' })
  await appearance.getByRole('button', { name: 'Dark' }).click()
  await expect(appearance.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => theme(page)).toBe('dark')
  await expect
    .poll(() => JSON.parse(readFileSync(join(userDataDir, 'settings.json'), 'utf8')).theme)
    .toBe('dark')
  expect(tiger.errors).toEqual([])

  // Quit for real and start again on the same profile.
  await tiger.app.close()
  const again = await launchTiger(userDataDir)
  try {
    await expect.poll(() => theme(again.page)).toBe('dark')
    await again.page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(
      again.page.getByRole('group', { name: 'Appearance' }).getByRole('button', { name: 'Dark' })
    ).toHaveAttribute('aria-pressed', 'true')
    // The native window background follows the saved theme from the first frame.
    const bg = await again.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getBackgroundColor()
    )
    expect(bg.toLowerCase()).toContain('0f1117')
    expect(again.errors).toEqual([])
  } finally {
    await closeTiger(again)
  }
})
