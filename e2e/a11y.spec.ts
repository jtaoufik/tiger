/**
 * Automated WCAG 2.2 AA audit of every surface of the real app with axe-core.
 *
 * The tour visits home, the workspace before and after a send, every request
 * and response tab, context menus, the command palette, shortcuts,
 * environments, history, the runner, the import report, team sync (setup,
 * status and the conflict view), every Settings tab and the update banner, in
 * light and dark, in English and in Arabic (right to left). Key screens are
 * checked again with forced colors (Windows High Contrast) and reduced motion.
 * A keyboard-only journey checks Tab order, focus traps and visible focus.
 *
 * Every violation found is written to test-results/a11y/<run>.json (rule,
 * impact, screen, offending nodes) and fails the test. Rules are never turned
 * off; a proven false positive gets a narrowly scoped exclusion in EXCLUDE,
 * with the reason next to it.
 *
 * Runs headless like the rest of the suite (TIGER_E2E=1: no window is shown).
 */
import AxeBuilder from '@axe-core/playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import type { MessageKey } from '../src/core/i18n'
import type { Locale } from '../src/core/i18n/locales'
import { translatorFor } from '../src/core/i18n/all'
import {
  closeTiger,
  collectionTree,
  expect,
  launchTiger,
  makeCollection,
  makeUserDataDir,
  MOD,
  openCollection,
  openRequest,
  rm,
  startServer,
  stubFolderDialog,
  test,
  useEnvironment,
  type Tiger
} from './fixtures'

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT = join(REPO_ROOT, 'test-results', 'a11y')

/** WCAG 2.0, 2.1 and 2.2, levels A and AA. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/**
 * Proven false positives, as narrowly as axe allows (one rule, one selector).
 * Empty: every finding of the audit was fixed in source.
 */
const EXCLUDE: Array<{ rule: string; selector: string; why: string }> = []

const gitHome = mkdtempSync(join(tmpdir(), 'tiger-e2e-a11y-git-'))
const gitConfig = join(gitHome, 'gitconfig')
writeFileSync(
  gitConfig,
  '[user]\n\tname = Tiger E2E\n\temail = e2e@tiger.test\n[init]\n\tdefaultBranch = main\n[commit]\n\tgpgsign = false\n'
)
const gitEnv = { GIT_CONFIG_GLOBAL: gitConfig, GIT_CONFIG_NOSYSTEM: '1' }
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, env: { ...process.env, ...gitEnv }, encoding: 'utf8' }).trim()

test.afterAll(() => rm(gitHome))

const runMenu = (app: ElectronApplication, id: string) =>
  app.evaluate(({ Menu }, itemId) => Menu.getApplicationMenu()?.getMenuItemById(itemId)?.click(), id)

/** Exact accessible name, ignoring the invisible bidi isolates Arabic text carries. */
function named(text: string): RegExp {
  const iso = '[\\u2066-\\u2069]*'
  const body = [...text].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(iso)
  return new RegExp(`^${iso}${body}${iso}$`)
}

/**
 * Turn the (plain) collection into a shared one where a teammate and "me"
 * renamed the same request: the next "Sync with team" stops on a conflict.
 */
function makeConflict(dir: string): void {
  const bare = join(gitHome, `team-${Date.now()}.git`)
  git(gitHome, 'init', '--bare', '--initial-branch=main', bare)
  git(dir, 'init')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-m', 'Share collection with the team')
  git(dir, 'remote', 'add', 'origin', pathToFileURL(bare).href)
  git(dir, 'push', '-u', 'origin', 'main')
  const mate = join(gitHome, `mate-${Date.now()}`)
  git(gitHome, 'clone', pathToFileURL(bare).href, mate)
  const file = 'posts/list-posts.tiger'
  const edit = (root: string, name: string) => {
    const path = join(root, file)
    writeFileSync(path, readFileSync(path, 'utf8').replace(/^ {2}name: .*$/m, `  name: ${name}`))
  }
  edit(mate, 'List posts (teammate)')
  git(mate, 'commit', '-am', 'Rename List posts')
  git(mate, 'push')
  edit(dir, 'List posts (mine)')
  git(dir, 'commit', '-am', 'Rename List posts my way')
}

/** Wait until no finite animation or transition is still running (a fading dialog skews contrast). */
async function settle(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () =>
        document.getAnimations().every((a) => {
          const timing = a.effect?.getComputedTiming()
          return a.playState !== 'running' || timing?.endTime === Infinity
        }),
      undefined,
      { timeout: 3_000 }
    )
    .catch(() => {})
  await page.waitForTimeout(80)
}

export interface Finding {
  run: string
  screen: string
  rule: string
  impact: string
  help: string
  nodes: Array<{ target: string; summary: string; html: string }>
}

/**
 * Nodes axe could not decide, per rule ("needs review"), for the report. Most
 * are color-contrast over the frosted glass (backdrop-filter): those are
 * measured from pixels by the contrast sweep (npm run test:contrast).
 */
const review: Record<string, Record<string, number>> = {}

async function axe(page: Page, run: string, screen: string): Promise<Finding[]> {
  await settle(page)
  let builder = new AxeBuilder({ page }).withTags(TAGS).setLegacyMode(true)
  for (const e of EXCLUDE) builder = builder.exclude(e.selector)
  const result = await builder.analyze()
  const r = (review[run] ??= {})
  for (const v of result.incomplete) r[v.id] = (r[v.id] ?? 0) + v.nodes.length
  return result.violations.map((v) => ({
    run,
    screen,
    rule: v.id,
    impact: v.impact ?? '',
    help: v.help,
    nodes: v.nodes.map((n) => ({
      target: n.target.join(' '),
      summary: (n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 300),
      html: n.html.slice(0, 200)
    }))
  }))
}

function report(run: string, screens: string[], findings: Finding[], stepErrors: string[]): void {
  mkdirSync(OUT, { recursive: true })
  const nodes = findings.reduce((s, f) => s + f.nodes.length, 0)
  writeFileSync(join(OUT, `${run}.json`), JSON.stringify({ run, screens, violations: findings.length, nodes, findings, needsReview: review[run] ?? {}, stepErrors }, null, 1))
  console.log(`[a11y ${run}] screens ${screens.length}, violations ${findings.length} (${nodes} nodes), step errors ${stepErrors.length}, needs review ${JSON.stringify(review[run] ?? {})}`)
  for (const f of findings) console.log(`  ${f.screen}\t${f.rule} (${f.impact})\t${f.nodes.map((n) => n.target).join(' | ')}`)
  for (const e of stepErrors) console.log(`  step error: ${e}`)
}

function failures(findings: Finding[]): string[] {
  return findings.flatMap((f) => f.nodes.map((n) => `${f.screen}: ${f.rule} at ${n.target} (${n.summary})`))
}

interface Tour {
  t: Tiger
  lang: Locale
  run: string
  collection: string
  serverUrl: string
}

/**
 * Every surface, language independent: menu items by id, catalog strings for
 * the few controls found by name, CSS hooks for the rest.
 */
async function tour({ t, lang, run, collection, serverUrl }: Tour, check: (screen: string) => Promise<void>): Promise<string[]> {
  const { page, app } = t
  const tr = translatorFor(lang)
  const k = (key: string) => tr(key as MessageKey)
  const errors: string[] = []
  const step = async (screen: string, setup: () => Promise<void>) => {
    try {
      await setup()
      await check(screen)
    } catch (e) {
      errors.push(`${screen}: ${(e as Error).message.split('\n')[0]}`)
      // Leave whatever overlay the failed step opened.
      await page.keyboard.press('Escape').catch(() => {})
    }
  }
  const tree = page.getByRole('tree').first()
  const col = tree.getByRole('treeitem', { name: named('jsonplaceholder') })
  const request = (label: string) => col.getByRole('treeitem', { name: named(label) })
  const unfold = async () => {
    const folded = col.locator('[role="treeitem"][aria-expanded="false"]')
    for (let guard = 0; guard < 50 && (await folded.count()) > 0; guard++) {
      await folded.first().focus()
      await page.keyboard.press(lang === 'ar' ? 'ArrowLeft' : 'ArrowRight')
    }
  }
  const open = async (label: string) => {
    if (!(await request(label).isVisible())) await unfold()
    await request(label).locator('.row-label').first().click()
    await expect(page.locator('.panel.editor')).toBeVisible()
  }
  const send = async () => {
    await page.keyboard.press(`${MOD}+Enter`)
    await expect(page.locator('.resp-status')).toBeVisible()
  }
  const dialog = () => page.getByRole('dialog').first()
  const closeOverlay = async () => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(120)
  }
  const ctx = async (target: Locator) => {
    await target.scrollIntoViewIfNeeded()
    await target.hover()
    await page.waitForTimeout(300)
    await target.click({ button: 'right' })
    await expect(page.locator('.ctx-menu')).toBeVisible()
  }

  await page.setViewportSize({ width: 1280, height: 800 })
  // A missing control fails its step fast instead of eating the test timeout.
  page.setDefaultTimeout(10_000)

  await step('home', async () => {
    await runMenu(app, 'getting-started')
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
  })

  await step('history-empty', async () => {
    await runMenu(app, 'history')
    await expect(dialog()).toBeVisible()
  })
  await closeOverlay()

  await stubFolderDialog(app, collection)
  await runMenu(app, 'open-collection')
  await expect(col).toBeVisible()
  await page.getByRole('combobox', { name: named(k('app.top.activeEnv')) }).selectOption({ label: 'demo' })

  await step('team-sync-setup', async () => {
    await runMenu(app, 'team-sync')
    await expect(dialog()).toBeVisible()
    await page.waitForTimeout(400)
  })
  await closeOverlay()

  await step('workspace', async () => open('GET List posts'))
  await step('workspace-sent', async () => send())

  // Every response tab, then every request tab.
  const respTabs = page.locator('.panel.response [role=tablist] [role=tab]')
  const nResp = await respTabs.count()
  for (let i = 0; i < nResp; i++) {
    const name = ((await respTabs.nth(i).textContent()) ?? `#${i}`).trim()
    await step(`response-tab ${name}`, async () => {
      await respTabs.nth(i).click()
    })
  }
  const reqTabs = page.locator('.panel.editor [role=tablist] [role=tab]')
  const nReq = await reqTabs.count()
  for (let i = 0; i < nReq; i++) {
    const name = ((await reqTabs.nth(i).textContent()) ?? `#${i}`).trim()
    await step(`request-tab ${name}`, async () => {
      await reqTabs.nth(i).click()
    })
  }
  // Body types and auth on a POST.
  await step('request-body-json', async () => {
    await open('POST Create post')
    await reqTabs.nth(1).click()
    await expect(page.locator('.body-toolbar')).toBeVisible()
  })

  // Context menus and the New menu.
  await step('menu-collection', async () => ctx(col.locator('> .col-head')))
  await closeOverlay()
  await step('menu-folder', async () => ctx(col.locator('.folder-row').first()))
  await closeOverlay()
  await step('menu-request', async () => ctx(request('GET List posts').locator('> .tree-row .row-label')))
  await closeOverlay()
  await step('menu-tab', async () => ctx(page.locator('.request-tab').first()))
  await closeOverlay()
  await step('menu-new', async () => {
    await page.locator('.sidebar-actions .sidebar-action').first().click()
    await expect(page.getByRole('menu').first()).toBeVisible()
  })
  await closeOverlay()

  // Command palette, shortcuts.
  await step('palette', async () => {
    await runMenu(app, 'command-palette')
    await expect(dialog()).toBeVisible()
  })
  await step('palette-commands', async () => {
    await page.keyboard.type('>')
  })
  await closeOverlay()
  await step('shortcuts', async () => {
    await runMenu(app, 'shortcuts')
    await expect(dialog()).toBeVisible()
  })
  await closeOverlay()

  // Environments, history.
  await step('environments', async () => {
    await runMenu(app, 'environments')
    await expect(dialog()).toBeVisible()
    await dialog().locator('.env-pick').first().click()
  })
  await closeOverlay()
  await closeOverlay()
  await step('history', async () => {
    await runMenu(app, 'history')
    await expect(dialog()).toBeVisible()
  })
  await closeOverlay()

  // Runner with results.
  await step('runner', async () => {
    await runMenu(app, 'run-collection')
    await expect(dialog()).toBeVisible()
    await dialog().locator('.btn.accent').first().click()
    await expect(dialog().getByRole('table')).toBeVisible()
    await page.waitForTimeout(800)
  })
  await closeOverlay()

  // Import dialog, then the report of a Postman export with unsupported parts.
  const exportFile = join(resolve(collection, '..'), 'shop.postman_collection.json')
  writeFileSync(
    exportFile,
    JSON.stringify({
      info: { name: 'Shop API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      item: [
        {
          name: 'Orders',
          item: [
            {
              name: 'List orders',
              request: { method: 'GET', url: '{{baseUrl}}/orders/:id', auth: { type: 'hawk', hawk: [] } },
              event: [{ listen: 'test', script: { exec: ['pm.sendRequest("x")', 'pm.test("ok", () => {})'] } }]
            }
          ]
        }
      ],
      variable: [{ key: 'baseUrl', value: serverUrl }]
    })
  )
  await step('import', async () => {
    await stubFolderDialog(app, exportFile)
    await runMenu(app, 'import')
    await expect(dialog()).toBeVisible()
  })
  await step('import-report', async () => {
    await dialog().getByRole('button', { name: /^[⁦-⁩]*Postman/ }).first().click()
    await expect(page.locator('.import-report')).toBeVisible()
  })
  await closeOverlay()
  await stubFolderDialog(app, collection)

  // Confirmation and prompt dialogs.
  await step('confirm-delete', async () => {
    const row = request('GET List posts').locator('> .tree-row')
    await row.locator('.row-label').hover()
    await row.getByRole('button', { name: named(k('sidebar.row.deleteRequest')) }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
  })
  await closeOverlay()
  await step('prompt-new-folder', async () => {
    await runMenu(app, 'new-folder')
    await expect(dialog()).toBeVisible()
  })
  await closeOverlay()

  // Collection page.
  await step('collection-view', async () => {
    await col.locator('> .col-head').click()
    await page.waitForTimeout(300)
  })

  // Settings, every tab.
  const settingsBtn = page.getByRole('button', { name: named(k('app.top.settings')) })
  await settingsBtn.click()
  const sTabs = page.locator('.settings-tabs [role=tab]')
  await expect(sTabs.first()).toBeVisible()
  const nSettings = await sTabs.count()
  for (let i = 0; i < nSettings; i++) {
    const name = ((await sTabs.nth(i).textContent()) ?? `#${i}`).trim()
    await step(`settings ${name}`, async () => {
      await sTabs.nth(i).click()
    })
  }
  await settingsBtn.click()

  // Team sync: status with local changes, then the conflict view.
  // Reload so the app reads the now shared (and diverged) collection from disk.
  makeConflict(collection)
  await page.reload()
  await step('team-sync-status', async () => {
    await expect(col).toBeVisible()
    await unfold()
    await expect(request('GET List posts (mine)')).toBeVisible()
    await col.locator('> .col-head').click()
    await runMenu(app, 'team-sync')
    await expect(dialog()).toBeVisible()
    await page.waitForTimeout(600)
  })
  await step('team-sync-conflict', async () => {
    await dialog().getByRole('button', { name: named(k('actions.sync.label')) }).first().click()
    await expect(dialog().getByRole('button', { name: named(k('team.conflict.finish')) })).toBeVisible({ timeout: 20_000 })
  })
  await closeOverlay()

  // Update banner, as an auto-update install shows it, then the manual-update dialog.
  await step('update-banner', async () => {
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('tiger:update:mode')
      ipcMain.handle('tiger:update:mode', () => ({ mode: 'auto', reason: 'e2e' }))
      ipcMain.removeHandler('tiger:update:getState')
      ipcMain.handle('tiger:update:getState', () => ({ status: 'downloaded', version: '0.8.1' }))
    })
    await page.reload()
    await expect(page.locator('.update-ready').first()).toBeVisible()
  })
  await step('update-progress', async () => {
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('tiger:update:getState')
      ipcMain.handle('tiger:update:getState', () => ({ status: 'downloading', version: '0.8.1', percent: 42 }))
    })
    await page.reload()
    await expect(page.locator('.update-ready').first()).toBeVisible()
  })
  await step('update-dialog', async () => {
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('tiger:update:mode')
      ipcMain.handle('tiger:update:mode', () => ({ mode: 'manual', reason: 'e2e' }))
      ipcMain.removeHandler('tiger:checkUpdate')
      ipcMain.handle('tiger:checkUpdate', () => ({ latest: '0.9.0', url: 'https://example.invalid', notes: ['Faster sends', 'Dark mode fixes'] }))
    })
    await page.reload()
    await expect(dialog()).toBeVisible()
  })
  void run
  return errors
}

for (const lang of ['en', 'ar'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    const run = `${lang}-${theme}`
    test(`axe WCAG 2.2 AA: every surface (${run})`, async () => {
      test.setTimeout(420_000)
      const server = await startServer()
      const collection = makeCollection(server.url)
      const ud = makeUserDataDir({ language: lang, theme })
      const t = await launchTiger(ud, gitEnv)
      const findings: Finding[] = []
      const screens: string[] = []
      let stepErrors: string[] = []
      try {
        if (lang === 'ar') await expect.poll(() => t.page.evaluate(() => document.documentElement.dir)).toBe('rtl')
        stepErrors = await tour({ t, lang, run, collection, serverUrl: server.url }, async (screen) => {
          screens.push(screen)
          findings.push(...(await axe(t.page, run, screen)))
        })
      } finally {
        report(run, screens, findings, stepErrors)
        await closeTiger(t)
        await server.close()
        rm(resolve(collection, '..'))
        rm(ud)
      }
      expect(stepErrors, 'every surface was reached').toEqual([])
      expect(failures(findings)).toEqual([])
    })
  }
}

/** What has focus: where it sits, how it shows, and whether it is inside a dialog. */
interface Stop {
  id: string
  region: number
  inDialog: boolean
  visible: boolean
  outline: string
  hasOutline: boolean
}

function focusStop(page: Page): Promise<Stop | null> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el || el === document.body || el === document.documentElement) return null
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const label = el.getAttribute('aria-label') ?? el.getAttribute('title') ?? (el.textContent ?? '').trim().slice(0, 30)
    const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.') : ''
    // Reading order of the window's landmarks: skip link, title bar, sidebar, splitter, main.
    const region = el.classList.contains('skip-link')
      ? 0
      : el.closest('header')
        ? 1
        : el.closest('nav, .sidebar')
          ? 2
          : el.closest('main')
            ? 4
            : 3
    // The focus outline is drawn by the focused element, or by the one box
    // that stands for it: a field's frame (:focus-within on the parent) or a
    // tree item's row (its first child).
    const drawn = (x: Element | null) => {
      if (!x) return null
      const s = getComputedStyle(x)
      const w = parseFloat(s.outlineWidth) || 0
      return s.outlineStyle !== 'none' && w >= 1 && !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(s.outlineColor) ? s : null
    }
    const ring = drawn(el) ?? drawn(el.parentElement) ?? (el.getAttribute('role') === 'treeitem' ? drawn(el.firstElementChild) : null)
    return {
      id: `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}[${el.getAttribute('role') ?? ''}] "${label}"`,
      region,
      inDialog: !!el.closest('[role=dialog], [role=alertdialog]'),
      visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden',
      outline: `${(ring ?? cs).outlineStyle} ${(ring ?? cs).outlineWidth} ${(ring ?? cs).outlineColor}`,
      hasOutline: !!ring
    }
  })
}

/** Tab (or Shift+Tab) through the whole window once; stops when focus is back where it started. */
async function tabCycle(page: Page, key: 'Tab' | 'Shift+Tab', max = 160): Promise<{ stops: Stop[]; wrapped: boolean }> {
  const stops: Stop[] = []
  let first: string | null = null
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(key)
    const s = await focusStop(page)
    if (!s) continue // the document itself, between the last and the first stop
    if (first === null) first = s.id
    else if (s.id === first) return { stops, wrapped: true }
    stops.push(s)
  }
  return { stops, wrapped: false }
}

test('keyboard only: sane Tab order, no trap outside dialogs, visible focus on every stop', async ({ tiger, collection }) => {
  test.setTimeout(120_000)
  const { page, app } = tiger
  await page.setViewportSize({ width: 1280, height: 800 })
  await openCollection(tiger, collection)
  await useEnvironment(page, 'demo')
  await openRequest(page, 'GET', 'List posts')
  await page.keyboard.press(`${MOD}+Enter`)
  await expect(page.locator('.resp-status')).toContainText('200')
  // Start from a fresh document, like a keyboard user's launch.
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Request URL' })).toBeVisible()

  const forward = await tabCycle(page, 'Tab')
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'keyboard.json'), JSON.stringify(forward, null, 1))
  expect(forward.wrapped, `Tab never came back to the start: trapped after ${forward.stops.at(-1)?.id}`).toBe(true)
  const ids = forward.stops.map((s) => s.id)
  expect(forward.stops.length, 'a real Tab order').toBeGreaterThan(15)
  expect(forward.stops[0].region, 'the skip link is the first stop').toBe(0)
  expect(forward.stops.filter((s) => s.inDialog), 'no dialog is open').toEqual([])
  // Landmarks are visited in reading order: never back to an earlier one.
  const backwards = forward.stops.filter((s, i) => i > 0 && s.region < forward.stops[i - 1].region).map((s) => s.id)
  expect(backwards, 'Tab order follows the layout').toEqual([])
  expect(forward.stops.filter((s) => !s.visible).map((s) => s.id), 'every stop is on screen').toEqual([])
  expect(
    forward.stops.filter((s) => !s.hasOutline).map((s) => `${s.id}: ${s.outline}`),
    'every stop shows a focus outline'
  ).toEqual([])
  // Shift+Tab walks the same stops in reverse.
  const back = await tabCycle(page, 'Shift+Tab')
  expect(back.wrapped).toBe(true)
  expect(new Set(back.stops.map((s) => s.id)), 'Shift+Tab visits the same stops').toEqual(new Set(ids))

  // Dialogs do trap focus, and give it back on Escape.
  const url = page.getByRole('textbox', { name: 'Request URL' })
  await url.focus()
  await page.keyboard.press(`${MOD}+k`)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(url, 'focus returns to where it was').toBeFocused()
  for (const id of ['environments', 'shortcuts', 'history']) {
    await runMenu(app, id)
    await expect(page.getByRole('dialog')).toBeVisible()
    await settle(page)
    const inside: Stop[] = []
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab')
      const s = await focusStop(page)
      if (s) inside.push(s)
    }
    expect(inside.filter((s) => !s.inDialog).map((s) => s.id), `${id}: Tab stays in the dialog`).toEqual([])
    expect(inside.filter((s) => !s.hasOutline).map((s) => `${s.id}: ${s.outline}`), `${id}: visible focus`).toEqual([])
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
  }
  expect(tiger.errors).toEqual([])
})

test('forced colors and reduced motion: key screens pass axe, focus stays visible, nothing animates', async ({ tiger, collection }) => {
  test.setTimeout(180_000)
  const { page, app } = tiger
  const run = 'forced-colors'
  const findings: Finding[] = []
  const screens: string[] = []
  const notes: string[] = []
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' })
  expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches && matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
  const check = async (screen: string) => {
    screens.push(screen)
    findings.push(...(await axe(page, run, screen)))
  }
  /** Animations still running right after a surface opens (should be none with reduced motion). */
  const moving = (screen: string) =>
    page
      .evaluate(() =>
        document
          .getAnimations()
          .filter((a) => a.playState === 'running')
          .map((a) => {
            const target = (a.effect as KeyframeEffect | null)?.target as HTMLElement | null
            const duration = Number(a.effect?.getComputedTiming().duration ?? 0)
            return { name: (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? '', duration, on: target?.className ?? '' }
          })
          .filter((a) => a.duration > 20)
      )
      .then((list) => list.map((a) => `${screen}: ${a.name} ${a.duration}ms on .${String(a.on).split(' ')[0]}`))

  try {
    await check('home')
    await openCollection(tiger, collection)
    await useEnvironment(page, 'demo')
    await openRequest(page, 'GET', 'List posts')
    await page.keyboard.press(`${MOD}+Enter`)
    await expect(page.locator('.resp-status')).toContainText('200')
    await check('workspace-sent')

    for (const id of ['command-palette', 'environments', 'shortcuts', 'history', 'team-sync']) {
      await runMenu(app, id)
      await expect(page.getByRole('dialog')).toBeVisible()
      notes.push(...(await moving(id)))
      await check(id)
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toBeHidden()
    }
    await collectionTree(page).getByRole('treeitem', { name: 'GET List posts', exact: true }).locator('.row-label').first().click({ button: 'right' })
    await expect(page.locator('.ctx-menu')).toBeVisible()
    notes.push(...(await moving('context-menu')))
    await check('context-menu')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await check('settings')
    await page.getByRole('button', { name: 'Settings', exact: true }).click()

    // Box shadows are dropped in forced colors: every focus indicator must be an outline.
    await page.reload()
    await expect(page.getByRole('textbox', { name: 'Request URL' })).toBeVisible()
    const cycle = await tabCycle(page, 'Tab')
    expect(cycle.wrapped).toBe(true)
    notes.push(...cycle.stops.filter((s) => !s.hasOutline).map((s) => `focus not visible in forced colors: ${s.id} (${s.outline})`))
  } finally {
    report(run, screens, findings, notes)
  }
  expect(failures(findings)).toEqual([])
  expect(notes).toEqual([])
  expect(tiger.errors).toEqual([])
})
