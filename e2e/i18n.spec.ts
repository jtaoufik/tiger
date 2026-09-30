/**
 * Languages end to end: the system language picks the UI language, Settings
 * switches it live (native menu included), Arabic flips the layout to right
 * to left, and every language is screenshotted in light and dark into
 * docs/ux/i18n/ for a human look at overflow and clipping.
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ElectronApplication, Page } from '@playwright/test'
import { SUPPORTED_LOCALES, type Locale, type MessageKey } from '../src/core/i18n'
import { translatorFor } from '../src/core/i18n/all'
import {
  closeTiger,
  expect,
  launchTiger,
  makeCollection,
  makeUserDataDir,
  rm,
  startServer,
  stubFolderDialog,
  test,
  MOD
} from './fixtures'

const SHOTS = resolve(fileURLToPath(new URL('..', import.meta.url)), 'docs', 'ux', 'i18n')

const html = (page: Page) =>
  page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }))

/** Top-level labels of the native application menu. */
const menuLabels = (app: ElectronApplication) =>
  app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items.map((i) => i.label) ?? [])

/** Run a native menu item by its action id (locale-independent). */
const runMenuItem = (app: ElectronApplication, id: string) =>
  app.evaluate(({ Menu }, itemId) => Menu.getApplicationMenu()?.getMenuItemById(itemId)?.click(), id)

test('launched with a French system language, the UI and the native menu are French', async () => {
  const fr = translatorFor('fr')
  const ud = makeUserDataDir()
  const tiger = await launchTiger(ud, {}, { lang: 'fr' })
  try {
    const { page, app } = tiger
    await expect.poll(() => html(page)).toEqual({ lang: 'fr', dir: 'ltr' })
    await expect(page.getByRole('button', { name: fr('app.top.settings'), exact: true })).toBeVisible()
    await expect(page.getByRole('tree', { name: fr('sidebar.title') })).toBeVisible()
    expect(fr('app.top.settings')).not.toBe(translatorFor('en')('app.top.settings'))
    expect(await menuLabels(app)).toEqual(expect.arrayContaining([fr('menu.file'), fr('menu.edit'), fr('menu.help')]))
    // Nothing is saved: "System default" keeps following the OS language.
    expect(JSON.parse(readFileSync(join(ud, 'settings.json'), 'utf8')).language ?? 'system').toBe('system')
    expect(tiger.errors).toEqual([])
  } finally {
    await closeTiger(tiger)
    rm(ud)
  }
})

test('switching to Arabic in Settings flips the layout live and persists', async ({ tiger, userDataDir }) => {
  const { page, app } = tiger
  const en = translatorFor('en')
  const ar = translatorFor('ar')
  await expect.poll(() => html(page)).toEqual({ lang: 'en', dir: 'ltr' })

  const sidebarX = async () => (await page.getByRole('tree').first().boundingBox())!.x
  const ltrX = await sidebarX()

  await page.getByRole('button', { name: en('app.top.settings'), exact: true }).click()
  await page.getByRole('combobox', { name: en('settings.language.label') }).selectOption('ar')

  // Live: no reload, the same page flips to right to left.
  await expect.poll(() => html(page)).toEqual({ lang: 'ar', dir: 'rtl' })
  await expect(page.getByRole('combobox', { name: ar('settings.language.label') })).toHaveValue('ar')
  await expect(page.getByRole('heading', { name: ar('settings.title') })).toBeVisible()
  // The native menu is rebuilt in Arabic.
  await expect.poll(() => menuLabels(app)).toEqual(expect.arrayContaining([ar('menu.file'), ar('menu.help')]))
  await expect
    .poll(() => JSON.parse(readFileSync(join(userDataDir, 'settings.json'), 'utf8')).language)
    .toBe('ar')

  // The sidebar sits on the right in RTL.
  const width = await page.evaluate(() => window.innerWidth)
  const rtlBox = (await page.getByRole('tree').first().boundingBox())!
  expect(ltrX).toBeLessThan(width / 2)
  expect(rtlBox.x).toBeGreaterThan(width / 2)

  // Back to the workspace (the Settings button toggles): the layout is right
  // to left, but the URL stays left to right.
  await page.getByRole('button', { name: ar('app.top.settings'), exact: true }).click()
  const url = page.getByRole('textbox', { name: ar('request.url.label') })
  await expect(url).toBeVisible()
  expect(await url.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr')
  expect(await page.evaluate(() => getComputedStyle(document.body).direction)).toBe('rtl')

  // Back to English, still without a restart.
  await page.getByRole('button', { name: ar('app.top.settings'), exact: true }).click()
  await page.getByRole('combobox', { name: ar('settings.language.label') }).selectOption('en')
  await expect.poll(() => html(page)).toEqual({ lang: 'en', dir: 'ltr' })
  await expect.poll(() => menuLabels(app)).toEqual(expect.arrayContaining([en('menu.file')]))
  expect(tiger.errors).toEqual([])
})

test.describe('screenshots per language', () => {
  test.skip(!!process.env.CI, 'visual review artefacts, generated locally')

  for (const locale of SUPPORTED_LOCALES) {
    for (const theme of ['light', 'dark'] as const) {
      test(`${locale} ${theme}`, async () => {
        test.setTimeout(90_000)
        await shootLocale(locale, theme)
      })
    }
  }
})

async function shootLocale(locale: Locale, theme: 'light' | 'dark'): Promise<void> {
  const t = translatorFor(locale)
  const server = await startServer()
  const collection = makeCollection(server.url)
  const ud = makeUserDataDir({ language: locale, theme })
  const tiger = await launchTiger(ud)
  mkdirSync(SHOTS, { recursive: true })
  const shot = (name: string) => tiger.page.screenshot({ path: join(SHOTS, `${locale}-${theme}-${name}.png`) })
  try {
    const { page, app } = tiger
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect.poll(() => html(page)).toEqual({ lang: locale, dir: locale === 'ar' ? 'rtl' : 'ltr' })

    // Open the example collection through the native menu (its labels are translated, its ids are not).
    await stubFolderDialog(app, collection)
    await runMenuItem(app, 'open-collection')
    const tree = page.getByRole('tree').first()
    await expect(tree.getByRole('treeitem', { name: 'jsonplaceholder', exact: true })).toBeVisible()
    await page.getByRole('combobox', { name: t('app.top.activeEnv') }).selectOption({ label: 'demo' })
    await tree
      .getByRole('treeitem', { name: 'jsonplaceholder', exact: true })
      .getByRole('treeitem', { name: 'GET List posts', exact: true })
      .click()
    // Send only once the request is loaded in the editor.
    await expect(page.getByRole('textbox', { name: t('request.url.label') })).toHaveValue(/\/posts$/)
    await page.keyboard.press(`${MOD}+Enter`)
    await expect(page.locator('.resp-status')).toContainText('200')
    // New / Open / Import fit on one row at the default sidebar width.
    const actions = await page.locator('.sidebar-actions').evaluate((row) => {
      const tops = [...row.children].map((b) => Math.round(b.getBoundingClientRect().top))
      const spans = [...row.querySelectorAll('.sidebar-action-label')]
      const labels = spans.map((l) => l.getBoundingClientRect().width)
      // Full text width (a Range ignores the overflow clip) against the box, with subpixel slack.
      const textWidth = (el: Element) => {
        const range = document.createRange()
        range.selectNodeContents(el)
        return range.getBoundingClientRect().width
      }
      const truncated = spans
        .filter((l) => textWidth(l) - l.getBoundingClientRect().width > 0.5)
        .map((l) => l.textContent)
      return { rows: new Set(tops).size, overflow: row.scrollWidth - row.clientWidth, labels, truncated }
    })
    expect(actions.rows, 'sidebar actions on one row').toBe(1)
    expect(actions.overflow, 'sidebar actions overflow').toBeLessThanOrEqual(0)
    expect(Math.min(...actions.labels), 'labels visible at the default width').toBeGreaterThan(1)
    expect(actions.truncated, 'labels not truncated').toEqual([])
    // The request section tabs fit without scrolling at 1280 px.
    const tabsOverflow = await page
      .locator('.panel.editor .tabs')
      .evaluate((row) => row.scrollWidth - row.clientWidth)
    expect(tabsOverflow, 'request section tabs overflow').toBeLessThanOrEqual(0)
    await shot('workspace')

    if (theme === 'light') {
      // The home screen: import cards and the getting-started checklist, the longest copy.
      await runMenuItem(app, 'getting-started')
      await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
      await shot('home')

      await page.getByRole('button', { name: t('app.top.settings'), exact: true }).click()
      await expect(page.getByRole('heading', { name: t('settings.title') })).toBeVisible()
      await shot('settings')
      for (const tab of ['network', 'advanced'] as const) {
        await page.getByRole('tab', { name: t(`settings.tabs.${tab}.label` as MessageKey) }).click()
        await shot(`settings-${tab}`)
      }
    }
    expect(tiger.errors).toEqual([])
  } finally {
    await closeTiger(tiger)
    await server.close()
    rm(resolve(collection, '..'))
    rm(ud)
  }
}
