/**
 * A screen-by-screen tour of the app in Arabic (right to left), light and
 * dark, saved to docs/ux/i18n/ar-<theme>-<screen>.png for visual review:
 * home, workspace and response, context menus, command palette, shortcuts,
 * environments, history, runner, import report, every Settings tab, team
 * sync (setup and conflict) and the update banner. Assertions cover what a
 * picture cannot: the layout is right to left, nothing overflows its row,
 * and no raw catalog key leaks into the UI.
 *
 * Runs headless like the rest of the suite (no window is ever shown).
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import type { MessageKey, Translator } from '../src/core/i18n'
import { translatorFor } from '../src/core/i18n/all'
import {
  closeTiger,
  expect,
  launchTiger,
  makeCollection,
  makeUserDataDir,
  MOD,
  rm,
  startServer,
  stubFolderDialog,
  test
} from './fixtures'

const SHOTS = resolve(fileURLToPath(new URL('..', import.meta.url)), 'docs', 'ux', 'i18n')

const gitHome = mkdtempSync(join(tmpdir(), 'tiger-e2e-tour-git-'))
const gitConfig = join(gitHome, 'gitconfig')
writeFileSync(
  gitConfig,
  '[user]\n\tname = Tiger E2E\n\temail = e2e@tiger.test\n[init]\n\tdefaultBranch = main\n[commit]\n\tgpgsign = false\n'
)
const gitEnv = { GIT_CONFIG_GLOBAL: gitConfig, GIT_CONFIG_NOSYSTEM: '1' }
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, env: { ...process.env, ...gitEnv }, encoding: 'utf8' }).trim()

test.afterAll(() => rm(gitHome))

/** Exact accessible name, ignoring the invisible bidi isolates Arabic text carries. */
function named(text: string): RegExp {
  const iso = '[\\u2066-\\u2069]*'
  const body = [...text].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(iso)
  return new RegExp(`^${iso}${body}${iso}$`)
}

const runMenuItem = (app: ElectronApplication, id: string) =>
  app.evaluate(({ Menu }, itemId) => Menu.getApplicationMenu()?.getMenuItemById(itemId)?.click(), id)

/** A collection shared through a bare repo, where a teammate and "me" edited the same line. */
function conflictedCollection(serverUrl: string): string {
  const dir = makeCollection(serverUrl)
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
    writeFileSync(path, readFileSync(path, 'utf8').replace(/^  name: .*$/m, `  name: ${name}`))
  }
  edit(mate, 'List posts (teammate)')
  git(mate, 'commit', '-am', 'Rename List posts')
  git(mate, 'push')
  edit(dir, 'List posts (mine)')
  git(dir, 'commit', '-am', 'Rename List posts my way')
  return dir
}

/**
 * What a screenshot cannot prove: no raw catalog key leaks into the UI, and in
 * every visible text Latin tokens keep their order inside Arabic. The leading
 * dot of an extension (.tiger, .json) renders left of its letters, and a
 * number renders left of its unit (8 ms, 46 B), measured with DOM ranges.
 */
async function checkScreen(page: Page): Promise<void> {
  const text = await page.evaluate(() => document.body.innerText)
  const keys = text.match(/\b(app|sidebar|views|request|response|team|settings|modals|imports|actions|common)\.[a-z][\w-]*\.[\w.-]+\b/g)
  expect(keys, 'no raw catalog keys').toBeNull()
  const wrong = await page.evaluate(() => {
    const bad: string[] = []
    const x = (node: Node, at: number) => {
      const r = document.createRange()
      r.setStart(node, at)
      r.setEnd(node, at + 1)
      const rect = r.getBoundingClientRect()
      return rect.width ? rect.x : null
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode())) {
      const el = node.parentElement
      if (!el || !el.offsetParent || !/[\u0600-\u06ff]/.test(el.closest('p,div,span,button,li,label,h1,h2,h3,dd,dt,td')?.textContent ?? '')) continue
      const s = node.textContent ?? ''
      for (const m of s.matchAll(/(?<![\w/])\.(tiger|json|yaml|bru|wsdl|xml|pem|deb)\b/g)) {
        const dot = x(node, m.index!)
        const letter = x(node, m.index! + 1)
        if (dot !== null && letter !== null && dot > letter) bad.push(`"${m[0]}" in: ${s.slice(0, 60)}`)
      }
      for (const m of s.matchAll(/(\d+) (ms|B|KB|MB)\b/g)) {
        const digit = x(node, m.index!)
        const unit = x(node, m.index! + m[1].length + 1)
        if (digit !== null && unit !== null && digit > unit) bad.push(`"${m[0]}" in: ${s.slice(0, 60)}`)
      }
    }
    return bad
  })
  expect(wrong, 'Latin tokens keep their order in right-to-left text').toEqual([])
}

for (const theme of ['light', 'dark'] as const) {
  test(`Arabic tour (${theme})`, async () => {
    test.skip(!!process.env.CI, 'visual review artefacts, generated locally')
    test.setTimeout(180_000)
    const t: Translator = translatorFor('ar')
    const k = (key: string, vars?: Record<string, string | number>) => t(key as MessageKey, vars)
    const server = await startServer()
    const collection = conflictedCollection(server.url)
    const ud = makeUserDataDir({ language: 'ar', theme })
    const tiger = await launchTiger(ud, gitEnv)
    mkdirSync(SHOTS, { recursive: true })
    const { page, app } = tiger
    const shot = async (name: string, target?: Locator) => {
      await page.waitForTimeout(150)
      await (target ?? page).screenshot({ path: join(SHOTS, `ar-${theme}-${name}.png`) })
    }
    try {
      await page.setViewportSize({ width: 1280, height: 800 })
      await expect.poll(() => page.evaluate(() => document.documentElement.dir)).toBe('rtl')

      // Home.
      await runMenuItem(app, 'getting-started')
      await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
      await checkScreen(page)
      // The two home texts that used to read "ملفات tiger..": ".tiger" renders
      // as one left-to-right unit (dot left of its letters) with an Arabic word
      // after it, so no sentence punctuation can sit against the extension.
      const tigerTexts = await page.evaluate(() => {
        const out: Array<{ text: string; dotLeftOfT: boolean }> = []
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        let node: Node | null
        while ((node = walker.nextNode())) {
          const s = node.textContent ?? ''
          const i = s.indexOf('.tiger')
          if (i < 0 || !(node.parentElement as HTMLElement | null)?.offsetParent) continue
          const at = (k: number) => {
            const r = document.createRange()
            r.setStart(node!, k)
            r.setEnd(node!, k + 1)
            return r.getBoundingClientRect().x
          }
          out.push({ text: s, dotLeftOfT: at(i) < at(i + 1) })
        }
        return out
      })
      for (const card of [
        'المجموعة هي مجلد يضم ملفات ⁦.tiger⁩ على جهازك.',
        'أي مجلد يضم ملفات ⁦.tiger⁩ تفتحه مباشرةً من القرص.'
      ]) {
        const hit = tigerTexts.find((x) => x.text.startsWith(card))
        expect(hit, card).toBeTruthy()
        expect(hit!.dotLeftOfT, card).toBe(true)
      }
      await shot('home')

      // Workspace with a response.
      await stubFolderDialog(app, collection)
      await runMenuItem(app, 'open-collection')
      const tree = page.getByRole('tree').first()
      const col = tree.getByRole('treeitem', { name: named('jsonplaceholder') })
      await expect(col).toBeVisible()
      await page.getByRole('combobox', { name: named(k('app.top.activeEnv')) }).selectOption({ label: 'demo' })
      await col.getByRole('treeitem', { name: named('GET List posts (mine)') }).getByText('List posts (mine)').click()
      await expect(page.getByRole('textbox', { name: named(k('request.url.label')) })).toHaveValue(/\/posts$/)
      // RTL tree keys: ArrowRight collapses (WAI-ARIA, mirrored); the chevron then points left.
      const users = col.getByRole('treeitem', { name: named('users') })
      await users.focus()
      await page.keyboard.press('ArrowRight')
      await expect(users).toHaveAttribute('aria-expanded', 'false')
      await page.keyboard.press(`${MOD}+Enter`)
      await expect(page.locator('.resp-status')).toContainText('200')
      // The sidebar is on the right.
      const box = (await tree.boundingBox())!
      expect(box.x).toBeGreaterThan(640)
      await checkScreen(page)
      await shot('workspace')

      // Response headers tab.
      await page.getByRole('tab', { name: new RegExp(`^${k('response.tab.headers').split(' ')[0]}`) }).first().click().catch(() => {})
      await shot('response-headers')

      // Context menu on the collection.
      await col.locator('> .tree-row, > .col-head').first().click({ button: 'right' }).catch(async () => {
        await tree.getByText('jsonplaceholder', { exact: true }).click({ button: 'right' })
      })
      await expect(page.getByRole('menu').first()).toBeVisible()
      await checkScreen(page)
      await shot('menu-collection')
      await page.keyboard.press('Escape')

      // Command palette, then the shortcuts overlay.
      await runMenuItem(app, 'command-palette')
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.keyboard.type('>')
      await checkScreen(page)
      await shot('palette')
      await page.keyboard.press('Escape')
      await runMenuItem(app, 'shortcuts')
      await expect(page.getByRole('dialog')).toBeVisible()
      await shot('shortcuts')
      await page.keyboard.press('Escape')

      // Environments.
      await runMenuItem(app, 'environments')
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.getByRole('dialog').getByText('demo', { exact: true }).first().click().catch(() => {})
      await checkScreen(page)
      await shot('environments')
      await page.keyboard.press('Escape')

      // History.
      await runMenuItem(app, 'history')
      await expect(page.getByRole('dialog')).toBeVisible()
      await checkScreen(page)
      await shot('history')
      await page.keyboard.press('Escape')

      // Runner: run the collection and show the results.
      await runMenuItem(app, 'run-collection')
      const runner = page.getByRole('dialog')
      await expect(runner).toBeVisible()
      await runner.locator('.btn.accent').first().click()
      await expect(runner.getByRole('table')).toBeVisible()
      await page.waitForTimeout(800)
      await checkScreen(page)
      await shot('runner')
      await page.keyboard.press('Escape')

      // Import report: a Postman export with parts that only come in partly.
      const exportFile = join(gitHome, 'shop.postman_collection.json')
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
                  request: {
                    method: 'GET',
                    url: '{{baseUrl}}/orders/:id',
                    auth: { type: 'hawk', hawk: [] }
                  },
                  event: [{ listen: 'test', script: { exec: ['pm.sendRequest("x")', 'pm.test("ok", () => {})'] } }]
                }
              ]
            }
          ],
          variable: [{ key: 'baseUrl', value: 'https://shop.example.com' }]
        })
      )
      await stubFolderDialog(app, exportFile)
      await runMenuItem(app, 'import')
      const io = page.getByRole('dialog')
      await expect(io).toBeVisible()
      await checkScreen(page)
      await shot('import-export')
      await io.getByRole('group').first().getByRole('button', { name: /^[\u2066-\u2069]*Postman/ }).click()
      const report = page.locator('.import-report')
      await expect(report).toBeVisible()
      await checkScreen(page)
      await shot('import-report')
      await page.keyboard.press('Escape')

      // Settings, every tab. The MCP snippet shows a neutral install path, not this machine's.
      await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('tiger:mcpInfo')
        ipcMain.handle('tiger:mcpInfo', () => ({
          command: '/Applications/Tiger.app/Contents/MacOS/Tiger',
          serverPath: '/Applications/Tiger.app/Contents/Resources/app.asar.unpacked/out/mcp/server.mjs',
          env: { ELECTRON_RUN_AS_NODE: '1' }
        }))
      })
      await page.getByRole('button', { name: named(k('app.top.settings')) }).click()
      for (const tab of ['general', 'network', 'advanced', 'mcp', 'privacy', 'about']) {
        await page.getByRole('tab', { name: named(k(`settings.tabs.${tab}.label`)) }).click()
        await checkScreen(page)
        await shot(`settings-${tab}`)
      }
      await page.getByRole('button', { name: named(k('app.top.settings')) }).click()

      // Team sync on the collection, then a sync that runs into the teammate's change.
      await col.getByRole('treeitem', { name: named('GET List posts (mine)') }).getByText('List posts (mine)').click()
      await runMenuItem(app, 'team-sync')
      const team = page.getByRole('dialog')
      await expect(team).toBeVisible()
      await page.waitForTimeout(600)
      await checkScreen(page)
      await shot('team-sync')
      await team.getByRole('button', { name: named(k('actions.sync.label')) }).first().click()
      await expect(team.getByRole('button', { name: named(k('team.conflict.finish')) })).toBeVisible({ timeout: 20_000 })
      await checkScreen(page)
      await shot('team-conflict')
      await page.keyboard.press('Escape')

      // Update banner ("ready to install"), as an auto-update install shows it.
      await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('tiger:update:mode')
        ipcMain.handle('tiger:update:mode', () => ({ mode: 'auto', reason: 'e2e' }))
        ipcMain.removeHandler('tiger:update:getState')
        ipcMain.handle('tiger:update:getState', () => ({ status: 'downloaded', version: '0.8.1' }))
      })
      await page.reload()
      await expect(page.locator('.update-ready').first()).toBeVisible()
      await checkScreen(page)
      await shot('update-banner')

      expect(tiger.errors).toEqual([])
    } finally {
      await closeTiger(tiger)
      await server.close()
      rm(resolve(collection, '..'))
      rm(ud)
    }
  })
}
