/**
 * Contrast sweep over every screen and state of the real app, light and dark.
 *
 * For each screen: every visible text run, input value, placeholder, icon and
 * form-control boundary gets a WCAG contrast ratio. Text colors come from the
 * computed style; the background is measured from a screenshot taken with all
 * text made transparent, so glass, blur, saturate and gradients are what the
 * user actually sees. Failures are written to AUDIT_OUT (json + annotated
 * screenshots). Set AUDIT_STRICT=1 to turn failures into a failing test (CI
 * guard); by default the spec only reports.
 *
 * Headless like the rest of the suite (TIGER_E2E=1: the window is never shown).
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ElectronApplication, Page } from '@playwright/test'
import { closeTiger, expect, launchTiger, makeUserDataDir, rm, stubFolderDialog, test } from '../fixtures'
import {
  AUDIT_OUT,
  focusProbe,
  hex,
  hoverSweep,
  outPath,
  overflowScan,
  startAuditServer,
  sweep,
  toolbarScan,
  writeAuditCollection,
  type FocusStep,
  type OverflowHit,
  type SweepResult
} from './audit-lib'

const runMenu = (app: ElectronApplication, id: string) =>
  app.evaluate(({ Menu }, itemId) => Menu.getApplicationMenu()?.getMenuItemById(itemId)?.click(), id)

const COL = 'audit'

function auditTree(page: Page) {
  return page.getByRole('tree', { name: 'Collections' }).getByRole('treeitem', { name: COL, exact: true })
}

async function unfold(page: Page): Promise<void> {
  const folded = auditTree(page).locator('[role="treeitem"][aria-expanded="false"]')
  for (let guard = 0; guard < 60 && (await folded.count()) > 0; guard++) {
    await folded.first().focus()
    await page.keyboard.press('ArrowRight')
  }
}

async function openReq(page: Page, label: string): Promise<void> {
  const row = auditTree(page).getByRole('treeitem', { name: label, exact: true }).locator('> .tree-row')
  if (!(await row.isVisible().catch(() => false))) await unfold(page)
  await row.scrollIntoViewIfNeeded()
  // The label, not the row centre: the hover actions appear under the pointer.
  await row.locator('.row-label').click()
  await page.waitForTimeout(150)
}

/**
 * Right-click like a person: settle the scroll, rest on the target, then
 * click in place (an instant move-and-click near the tree's bottom edge can
 * scroll the tree, and any scroll closes the menu).
 */
async function contextMenuOn(page: Page, target: import('@playwright/test').Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded()
  await target.hover()
  await page.waitForTimeout(400)
  await target.click({ button: 'right' })
  await expect(page.locator('.ctx-menu')).toBeVisible()
}

async function send(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await page.waitForTimeout(700)
}

async function sectionTab(page: Page, name: RegExp): Promise<void> {
  await page.locator('.panel.editor [role=tablist] [role=tab]').filter({ hasText: name }).first().click()
  await page.waitForTimeout(120)
}

async function respTab(page: Page, name: RegExp): Promise<void> {
  await page.locator('.panel.response [role=tablist] [role=tab]').filter({ hasText: name }).first().click()
  await page.waitForTimeout(120)
}

const HOVER_MAIN = [
  '.titlebar .btn',
  '.env-combo .env-edit',
  '.sidebar-actions .sidebar-action',
  '.tree-row:not(.active)',
  '.tree-row.active',
  '.folder-row',
  '.col-head',
  '.request-tab:not(.active)',
  '.request-tab.active',
  '.request-tab-close',
  '.panel.editor .tabs .tab:not(.active)',
  '.urlbar .btn.accent',
  '.panel.response .resp-action',
  '.panel.response .resp-tabs button:not(.on)',
  '.panel.response .seg.mini button:not(.on)',
  '.panel.response .icon-btn',
  '.kv-editor .kv-add',
  '.icon-btn.save-btn'
]

// Long (about 10 minutes per theme): run before a release, or after a style
// change, with `npm run test:contrast`. Not part of the default e2e run.
test.skip(!process.env.TIGER_CONTRAST_SWEEP, 'set TIGER_CONTRAST_SWEEP=1 (npm run test:contrast)')

for (const theme of ['light', 'dark'] as const) {
  test(`contrast sweep (${theme})`, async () => {
    test.setTimeout(20 * 60_000)
    const server = await startAuditServer()
    const parent = mkdtempSync(join(tmpdir(), 'tiger-audit-col-'))
    const dir = join(parent, COL)
    mkdirSync(dir)
    writeAuditCollection(dir, server.url)
    const ud = makeUserDataDir({ theme })
    const tiger = await launchTiger(ud)
    const { page, app } = tiger
    const results: SweepResult[] = []
    const overflow: Record<string, OverflowHit[]> = {}
    const toolbars: Record<string, unknown> = {}
    const focus: Record<string, FocusStep[]> = {}
    const stepErrors: string[] = []

    const step = async (screen: string, setup: () => Promise<void>, opts: { hover?: string[]; state?: string; noOverflow?: boolean } = {}) => {
      try {
        await setup()
        results.push(await sweep(page, screen, theme, { state: opts.state }))
        if (!opts.noOverflow) {
          const hits = await overflowScan(page)
          if (hits.length) overflow[screen + (opts.state ? `:${opts.state}` : '')] = hits
        }
        if (opts.hover?.length) results.push(...(await hoverSweep(page, screen, theme, opts.hover)))
      } catch (e) {
        stepErrors.push(`${screen}: ${(e as Error).message.split('\n')[0]}`)
      }
    }

    try {
      await page.setViewportSize({ width: 1280, height: 800 })

      await step('home', async () => {
        await runMenu(app, 'getting-started')
        await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
      }, { hover: ['.welcome-tile.primary', '.welcome-tile:not(.primary)', '.welcome-switch-card .btn'] })

      await step('history-empty', async () => {
        await runMenu(app, 'history')
        await expect(page.getByRole('dialog')).toBeVisible()
      })
      await page.keyboard.press('Escape')

      // Open the audit collection.
      await stubFolderDialog(app, dir)
      await page.getByRole('navigation', { name: 'Collections' }).getByRole('button', { name: 'Open', exact: true }).click()
      await expect(auditTree(page)).toBeVisible()
      await page.getByRole('combobox', { name: 'Active environment' }).selectOption({ label: 'local' })
      await unfold(page)

      await step('workspace-no-response', async () => {
        await openReq(page, 'GET GET echo')
      })

      await step('get-200', async () => {
        await send(page)
        await expect(page.locator('.resp-status')).toContainText('200')
      }, { hover: HOVER_MAIN })
      toolbars['get-200'] = await toolbarScan(page, ['.titlebar', '.urlbar', '.response-head', '.response-subhead', '.sidebar-actions', '.name-row', '.sidebar-head'])
      focus['get-200'] = await focusProbe(page, 'get-200', theme, 90)

      for (const [id, re] of [
        ['params', /^Params/],
        ['body', /^Body/],
        ['headers', /^Headers/],
        ['auth', /^Auth/],
        ['capture', /^Save values/],
        ['scripts', /^Scripts/],
        ['docs', /^Notes/],
        ['code', /^Code/],
        ['perf', /^Load test/]
      ] as const) {
        await step(`tab-${id}`, async () => sectionTab(page, re))
      }

      // Body types on POST.
      await openReq(page, 'POST POST echo')
      await sectionTab(page, /^Body/)
      for (const bt of ['None', 'JSON', 'XML', 'Text', 'Form', 'GraphQL', 'Multipart']) {
        await step(`body-${bt.toLowerCase()}`, async () => {
          await page.locator('.body-toolbar .seg button').filter({ hasText: new RegExp(`^${bt}`, 'i') }).first().click()
          await page.waitForTimeout(120)
        }, { hover: bt === 'JSON' ? ['.body-toolbar .seg button:not(.on)', '.panel.editor .body-tool'] : [] })
      }

      // Auth types.
      for (const label of ['Bearer auth', 'Basic auth', 'API key auth', 'OAuth2 auth']) {
        await step(`auth-${label.split(' ')[0].toLowerCase()}`, async () => {
          await openReq(page, `GET ${label}`)
          await sectionTab(page, /^Auth/)
        })
      }

      // Response tabs and states.
      await step('resp-headers', async () => {
        await openReq(page, 'GET Sets cookies')
        await send(page)
        await respTab(page, /^Headers/)
      })
      await step('resp-cookies', async () => respTab(page, /^Cookies/))
      await step('resp-raw', async () => {
        await respTab(page, /^Body/)
        await page.locator('.panel.response .seg.mini button').filter({ hasText: /^Raw/ }).first().click()
      })
      await step('resp-timing-popover', async () => {
        await page.locator('.panel.response .meta-chip.timing').hover()
        await page.waitForTimeout(200)
      })
      await page.mouse.move(1, 1)
      await step('resp-search', async () => {
        await page.locator('.panel.response .seg.mini button').filter({ hasText: /^Pretty/ }).first().click().catch(() => {})
        await page.getByRole('button', { name: /search/i }).first().click()
        await page.keyboard.type('ok')
        await page.waitForTimeout(200)
      })
      await step('resp-tests', async () => {
        await openReq(page, 'GET Tests pass and fail')
        await send(page)
        await respTab(page, /^Tests/)
      })
      for (const s of [201, 301, 404, 500]) {
        await step(`status-${s}`, async () => {
          await openReq(page, `GET Status ${s}`)
          await send(page)
        })
      }
      await step('status-refused', async () => {
        await openReq(page, 'GET Connection refused')
        await send(page)
        await page.waitForTimeout(600)
      })
      await step('sending', async () => {
        await openReq(page, 'GET Slow response')
        await page.getByRole('button', { name: 'Send', exact: true }).click()
        await page.waitForTimeout(400)
      }, { hover: ['.urlbar .btn.danger'] })
      await page.locator('.urlbar .btn.danger').click().catch(() => {})
      await page.waitForTimeout(300)
      await step('missing-var', async () => openReq(page, 'GET Missing variable'))
      await step('json-bad', async () => {
        await openReq(page, 'POST POST echo')
        await sectionTab(page, /^Body/)
        await expect(page.locator('.body-toolbar')).toBeVisible()
        await page.locator('.body-toolbar .seg button[aria-pressed]').filter({ hasText: /^json$/i }).first().click()
        await page.locator('.panel.editor textarea.code-area').first().fill('{ "broken": tru')
        await page.waitForTimeout(250)
      })
      await step('long-names', async () => {
        await openReq(page, 'GET A request with a very long name that should truncate nicely in every list and tab')
        await sectionTab(page, /^Headers/)
      })

      // Method pills: every method active in the tree and the tab strip, then hovered.
      for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
        await step(`pill-${m.toLowerCase()}`, async () => openReq(page, `${m} ${m} echo`), { noOverflow: true })
      }
      results.push(...(await hoverSweep(page, 'pills', theme, ['.request-tab:not(.active)'], 8)))
      results.push(...(await hoverSweep(page, 'pills', theme, ['.tree-row:not(.active)'], 10)))

      // Context menus.
      await step('ctx-request', async () => {
        await contextMenuOn(page, auditTree(page).getByRole('treeitem', { name: 'GET GET echo', exact: true }).locator('> .tree-row .row-label'))
      }, { hover: ['.ctx-item:not(.danger)', '.ctx-item.danger'] })
      await page.keyboard.press('Escape')
      await step('ctx-folder', async () => {
        await contextMenuOn(page, auditTree(page).locator('.folder-row').filter({ hasText: /^methods$/ }).first())
      })
      await page.keyboard.press('Escape')
      await step('ctx-collection', async () => {
        await contextMenuOn(page, auditTree(page).locator('> .col-head'))
      })
      await page.keyboard.press('Escape')
      await step('ctx-tab', async () => {
        await contextMenuOn(page, page.locator('.request-tab').first())
      })
      await page.keyboard.press('Escape')
      await step('new-menu', async () => {
        await page.locator('.sidebar-actions .sidebar-action').first().click()
        await expect(page.getByRole('menu').first()).toBeVisible()
      })
      await page.keyboard.press('Escape')

      // Dialogs.
      await step('environments', async () => {
        await runMenu(app, 'environments')
        await expect(page.getByRole('dialog')).toBeVisible()
        await page.getByRole('dialog').getByText('local', { exact: true }).first().click().catch(() => {})
      }, { hover: ['.envs-modal .env-row', '.modal-close'] })
      focus['environments'] = await focusProbe(page, 'environments', theme, 40)
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')

      await step('history', async () => {
        await runMenu(app, 'history')
        await expect(page.getByRole('dialog')).toBeVisible()
      }, { hover: ['.hist-row'] })
      await page.keyboard.press('Escape')

      await step('palette', async () => {
        await runMenu(app, 'command-palette')
        await expect(page.getByRole('dialog')).toBeVisible()
      }, { hover: ['.palette-row:not(.sel)'] })
      await step('palette-commands', async () => {
        await page.keyboard.type('>')
        await page.waitForTimeout(150)
      })
      await step('palette-empty', async () => {
        await page.keyboard.type('zzzzzzzz')
        await page.waitForTimeout(150)
      })
      await page.keyboard.press('Escape')

      await step('shortcuts', async () => {
        await runMenu(app, 'shortcuts')
        await expect(page.getByRole('dialog')).toBeVisible()
      })
      await page.keyboard.press('Escape')

      await step('import', async () => {
        await runMenu(app, 'import')
        await expect(page.getByRole('dialog')).toBeVisible()
      }, { hover: ['.modal-backdrop .choice', '.modal-backdrop .seg button:not(.on)'] })
      await page.keyboard.press('Escape')
      await step('export', async () => {
        await runMenu(app, 'export')
        await expect(page.getByRole('dialog')).toBeVisible()
        await page.waitForTimeout(250)
      })
      await page.keyboard.press('Escape')

      // Import report from a Postman export with unsupported parts.
      const exportFile = join(parent, 'shop.postman_collection.json')
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
          variable: [{ key: 'baseUrl', value: server.url }]
        })
      )
      await step('import-report', async () => {
        await stubFolderDialog(app, exportFile)
        await runMenu(app, 'import')
        const io = page.getByRole('dialog')
        await expect(io).toBeVisible()
        await io.getByRole('button', { name: /^Postman/ }).first().click()
        await expect(page.locator('.import-report')).toBeVisible()
      })
      await page.keyboard.press('Escape')

      // Runner with pass and fail rows.
      await step('runner', async () => {
        await openReq(page, 'GET Tests pass and fail')
        await runMenu(app, 'run-collection')
        const runner = page.getByRole('dialog')
        await expect(runner).toBeVisible()
        await runner.locator('.btn.accent').first().click()
        await expect(runner.getByRole('table')).toBeVisible()
        await page.waitForTimeout(12000)
      })
      await page.keyboard.press('Escape')

      await step('team-sync', async () => {
        await runMenu(app, 'team-sync')
        await expect(page.getByRole('dialog')).toBeVisible()
        await page.waitForTimeout(500)
      })
      await page.keyboard.press('Escape')

      await step('confirm-delete', async () => {
        const row = auditTree(page).getByRole('treeitem', { name: 'GET Status 201', exact: true }).locator('> .tree-row')
        await row.scrollIntoViewIfNeeded()
        await row.locator('.row-label').hover()
        await row.getByRole('button', { name: 'Delete request' }).click()
        await expect(page.getByRole('alertdialog')).toBeVisible()
      }, { hover: ['.modal-backdrop .btn.danger', '.modal-backdrop .modal-foot .btn:not(.danger)'] })
      await page.keyboard.press('Escape')
      if (await page.getByRole('alertdialog').count()) {
        await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click().catch(() => {})
      }

      await step('prompt-new-folder', async () => {
        await runMenu(app, 'new-folder')
        await expect(page.getByRole('dialog')).toBeVisible()
      })
      await page.keyboard.press('Escape')

      await step('toast-success', async () => {
        const row = auditTree(page).getByRole('treeitem', { name: 'GET GET echo', exact: true }).locator('> .tree-row')
        await row.hover()
        await row.getByRole('button', { name: /duplicate/i }).click()
        await expect(page.locator('.toast').first()).toBeVisible()
      })

      // Collection and folder pages.
      await step('collection-view', async () => {
        await auditTree(page).locator('> .col-head').click()
        await page.waitForTimeout(300)
      }, { hover: ['.cv-tabs .tab:not(.active)', '.cv-head .icon-btn', '.ts-pill'] })
      await step('folder-view', async () => {
        await auditTree(page).locator('.folder-row').first().click()
        await page.waitForTimeout(300)
      }, { hover: ['.cv-req-row'] })

      // Settings, every tab.
      await page.getByRole('button', { name: 'Settings', exact: true }).click()
      for (const tab of ['General', 'Network', 'Advanced', 'AI assistants', 'Privacy', 'About']) {
        await step(`settings-${tab.toLowerCase()}`, async () => {
          await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).first().click()
          await page.waitForTimeout(150)
        }, { hover: tab === 'General' ? ['.seg button:not([aria-pressed=true])', '.settings-tabs [role=tab][aria-selected=false]'] : [] })
        if (tab === 'General') focus['settings-general'] = await focusProbe(page, 'settings-general', theme, 40)
      }
      await page.getByRole('button', { name: 'Settings', exact: true }).click()

      // Sidebar search with no hit.
      await step('sidebar-no-hit', async () => {
        await page.getByRole('searchbox').first().fill('qqqqqq')
        await page.waitForTimeout(250)
      })
      await page.getByRole('searchbox').first().fill('')

      // Update banner, as an auto-update install shows it.
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
      await step('update-modal', async () => {
        await app.evaluate(({ ipcMain }) => {
          ipcMain.removeHandler('tiger:update:mode')
          ipcMain.handle('tiger:update:mode', () => ({ mode: 'manual', reason: 'e2e' }))
          ipcMain.removeHandler('tiger:checkUpdate')
          ipcMain.handle('tiger:checkUpdate', () => ({ latest: '0.9.0', url: 'https://example.invalid', notes: ['Faster sends', 'Arabic right to left', 'Dark mode fixes'] }))
        })
        await page.reload()
        await expect(page.getByRole('dialog')).toBeVisible()
      })
    } finally {
      // Report.
      const fails = results.flatMap((r) => r.failures.map((f) => ({ screen: r.screen, state: r.state, ...f })))
      const summary = fails.map(
        (f) =>
          `${f.ratio.toFixed(2)}\t${f.kind}\t${f.screen}${f.state === 'default' ? '' : ' [' + f.state + ']'}\t${f.sel}\t"${f.text}"\tfg ${hex(f.fgEff)} bg ${hex(f.bg)}\t(dom ${isNaN(f.domRatio) ? '-' : f.domRatio.toFixed(2)})${f.disabled ? '\tDISABLED' : ''}`
      )
      writeFileSync(outPath(`contrast-${theme}.tsv`), summary.join('\n') + '\n')
      writeFileSync(
        outPath(`contrast-${theme}.json`),
        JSON.stringify({ results: results.map((r) => ({ screen: r.screen, state: r.state, shot: r.shot, annotated: r.annotated, count: r.measured.length, failures: r.failures })), stepErrors, overflow, toolbars, focus }, null, 1)
      )
      console.log(`[${theme}] screens ${results.length}, measured ${results.reduce((s, r) => s + r.measured.length, 0)}, failures ${fails.length}, step errors ${stepErrors.length}`)
      for (const e of stepErrors) console.log(`  step error: ${e}`)
      console.log(`  report: ${AUDIT_OUT}`)
      await closeTiger(tiger)
      await server.close()
      rm(parent)
      rm(ud)
      // Guard mode: text (any size) and icon-only controls; disabled controls are
      // exempt (WCAG 1.4.3), decorative icons next to a label are not checked,
      // and 1px boundaries depend on the device pixel ratio (AUDIT_STRICT=all
      // includes them).
      if (process.env.AUDIT_STRICT) {
        const guarded = fails.filter(
          (f) =>
            !f.disabled &&
            (f.kind !== 'boundary' || process.env.AUDIT_STRICT === 'all') &&
            (f.kind !== 'icon' || /icon-btn|env-activate|request-tab-close|kv-remove/.test(f.sel))
        )
        expect(guarded.map((f) => `${f.screen} [${f.state}] ${f.sel} "${f.text}" ${f.ratio.toFixed(2)}`)).toEqual([])
      }
    }
  })
}
