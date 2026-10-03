/**
 * Shared harness for the Electron end-to-end suite.
 *
 * Every test gets:
 *  - a fresh Electron user-data dir (settings.json, localStorage), seeded with
 *    analytics off and an explicit light theme so the host OS appearance never
 *    leaks into a run;
 *  - a private copy of examples/jsonplaceholder whose `baseUrl` points at a
 *    local HTTP server started by the test (the internet is never touched: the
 *    app also runs with TIGER_E2E=1, which cancels every non-loopback request);
 *  - a list of renderer console errors / page errors, asserted empty by default.
 *
 * The native "Open folder" dialog is replaced in the main process so the real
 * Open button → IPC → readOpenedCollection path runs against the temp folder.
 */
import { test as base, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// resolve() drops the trailing separator: on Windows a quoted "C:\repo\" arg
// escapes its closing quote and swallows the next argument.
const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const EXAMPLE = join(REPO_ROOT, 'examples', 'jsonplaceholder')

/** The platform's command modifier, as the app's shortcut handler reads it. */
export const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

export interface Recorded {
  method: string
  url: string
  headers: IncomingMessage['headers']
  body: string
}

export interface LocalServer {
  url: string
  requests: Recorded[]
  close: () => Promise<void>
}

/**
 * A tiny jsonplaceholder stand-in. Records every request so tests can assert
 * what the app actually sent on the wire.
 */
export async function startServer(): Promise<LocalServer> {
  const requests: Recorded[] = []
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      requests.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body })
      const path = (req.url ?? '/').split('?')[0]
      const json = (status: number, data: unknown): void => {
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(data))
      }
      if (req.method === 'GET' && path === '/posts') {
        return json(200, [{ id: 1, userId: 1, title: 'e2e-post-title' }])
      }
      if (req.method === 'POST' && path === '/posts') {
        let parsed: Record<string, unknown> = {}
        try {
          parsed = JSON.parse(body)
        } catch {
          /* echo nothing */
        }
        return json(201, { ...parsed, id: 4242 })
      }
      const post = /^\/posts\/(\w+)$/.exec(path)
      if (req.method === 'GET' && post) return json(200, { id: post[1], title: `post ${post[1]}` })
      if (path.startsWith('/echo')) return json(200, { method: req.method, url: req.url })
      json(404, { error: 'not found' })
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((r) => server.close(() => r()))
  }
}

/** Copy the example collection to a temp dir and point its env at `baseUrl`. */
export function makeCollection(baseUrl: string): string {
  const parent = mkdtempSync(join(tmpdir(), 'tiger-e2e-col-'))
  const dir = join(parent, 'jsonplaceholder')
  cpSync(EXAMPLE, dir, { recursive: true })
  const envFile = join(dir, 'environments', 'demo.tiger')
  const env = readFileSync(envFile, 'utf8').replace(
    /baseUrl: .*/,
    `baseUrl: ${baseUrl}`
  )
  writeFileSync(envFile, env)
  return dir
}

export function makeUserDataDir(settings: Record<string, unknown> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'tiger-e2e-ud-'))
  writeFileSync(
    join(dir, 'settings.json'),
    JSON.stringify({ theme: 'light', analyticsEnabled: false, clientId: 'e2e', ...settings }, null, 2)
  )
  return dir
}

export interface Tiger {
  app: ElectronApplication
  page: Page
  /** Console errors and uncaught page errors seen so far. */
  errors: string[]
}

export interface LaunchOptions {
  /**
   * Chromium's --lang switch: the "system language" the app sees. Defaults to
   * en-US so the suite never depends on the language of the machine it runs
   * on (the app follows the OS language when Settings > Language is System).
   */
  lang?: string
}

export async function launchTiger(
  userDataDir: string,
  extraEnv: Record<string, string> = {},
  opts: LaunchOptions = {}
): Promise<Tiger> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
  // A dev server URL would make the app load a Vite server instead of out/.
  delete env.ELECTRON_RENDERER_URL
  const app = await electron.launch({
    args: [REPO_ROOT, `--user-data-dir=${userDataDir}`, `--lang=${opts.lang ?? 'en-US'}`],
    cwd: REPO_ROOT,
    env: { ...env, TIGER_E2E: '1', ...extraEnv }
  })
  try {
    const page = await app.firstWindow()
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.waitForLoadState('domcontentloaded')
    // The UI is up once the sidebar tree has rendered (by role only: its
    // name is translated).
    await expect(page.getByRole('tree').first()).toBeVisible()
    return { app, page, errors }
  } catch (e) {
    // Never leave an orphan Electron behind a failed launch.
    await app.close().catch(() => {})
    throw e
  }
}

/**
 * The main window once its page has loaded. Under TIGER_E2E the app keeps its
 * windows hidden and unfocused (src/main/headless.ts): runs on a developer's
 * machine must never pop a window or steal focus.
 */
export function windowState(app: ElectronApplication): Promise<{ loaded: boolean; visible: boolean; focused: boolean }> {
  return app.evaluate(
    ({ BrowserWindow }) =>
      new Promise<{ loaded: boolean; visible: boolean; focused: boolean }>((done) => {
        const win = BrowserWindow.getAllWindows()[0]
        if (!win) return done({ loaded: false, visible: false, focused: false })
        const report = () => done({ loaded: true, visible: win.isVisible(), focused: win.isFocused() })
        if (!win.webContents.isLoading()) return report()
        win.webContents.once('did-finish-load', report)
      })
  )
}

/** Replace the native folder picker so "Open" picks `dir` without a dialog. */
export async function stubFolderDialog(app: ElectronApplication, dir: string): Promise<void> {
  await app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as typeof dialog.showOpenDialog
  }, dir)
}

/** Open `dir` through the sidebar's Open button. */
export async function openCollection(t: Tiger, dir: string): Promise<void> {
  await stubFolderDialog(t.app, dir)
  await t.page.getByRole('navigation', { name: 'Collections' }).getByRole('button', { name: 'Open', exact: true }).click()
  await expect(t.page.getByRole('treeitem', { name: 'jsonplaceholder', exact: true })).toBeVisible()
}

export function tree(page: Page) {
  return page.getByRole('tree', { name: 'Collections' })
}

/** The collection's tree item (the opened folder is named after its directory). */
export function collectionTree(page: Page) {
  return tree(page).getByRole('treeitem', { name: 'jsonplaceholder', exact: true })
}

export function responsePanel(page: Page) {
  return page.getByRole('region', { name: 'Response', exact: true })
}

/** Pick the active environment in the title bar by its visible name. */
export async function useEnvironment(page: Page, name: string): Promise<void> {
  const select = page.getByRole('combobox', { name: 'Active environment' })
  await select.selectOption({ label: name })
  await expect(select.locator('option:checked')).toHaveText(name)
}

/**
 * Unfold every folded folder of the sidebar tree, as a keyboard user would
 * (ArrowRight on a folded folder). Opened collections start folded except the
 * folders leading to the open request.
 */
export async function unfoldAll(page: Page): Promise<void> {
  const folded = collectionTree(page).locator('[role="treeitem"][aria-expanded="false"]')
  for (let guard = 0; guard < 50 && (await folded.count()) > 0; guard++) {
    await folded.first().focus()
    await page.keyboard.press('ArrowRight')
  }
}

/** Open a request of the temp collection from the sidebar tree. */
export async function openRequest(page: Page, method: string, name: string): Promise<void> {
  const row = collectionTree(page).getByRole('treeitem', { name: `${method} ${name}`, exact: true })
  if ((await row.count()) === 0) await unfoldAll(page)
  await row.click()
  await expect(page.getByRole('tab', { name: `${method} ${name}`, selected: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Request name' })).toHaveValue(name)
}

/** The status pill of the response panel, e.g. "200 OK". */
export function responseStatus(page: Page) {
  return responsePanel(page).locator('.resp-status')
}

export function rm(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
  } catch {
    /* Windows can hold a handle briefly; temp dirs are disposable */
  }
}

interface Fixtures {
  /** Extra environment variables for the Electron process (e.g. git config). */
  tigerEnv: Record<string, string>
  server: LocalServer
  collection: string
  userDataDir: string
  tiger: Tiger
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  server: async ({}, use) => {
    const server = await startServer()
    await use(server)
    await server.close()
  },
  collection: async ({ server }, use) => {
    const dir = makeCollection(server.url)
    await use(dir)
    rm(resolve(dir, '..'))
  },
  // eslint-disable-next-line no-empty-pattern
  userDataDir: async ({}, use) => {
    const dir = makeUserDataDir()
    await use(dir)
    rm(dir)
  },
  tigerEnv: [{}, { option: true }],
  tiger: async ({ userDataDir, tigerEnv }, use, testInfo) => {
    const t = await launchTiger(userDataDir, tigerEnv)
    await use(t)
    if (testInfo.status !== testInfo.expectedStatus) {
      await testInfo.attach('screenshot', { body: await t.page.screenshot(), contentType: 'image/png' }).catch(() => {})
      await testInfo.attach('console-errors', { body: t.errors.join('\n'), contentType: 'text/plain' })
    }
    await closeTiger(t)
  }
})

/**
 * Quit the app; fine when a test already closed it (relaunch checks). Windows
 * are destroyed first so an "unsaved changes" prompt left by a failed test can
 * never hang the teardown.
 */
export async function closeTiger(t: Tiger): Promise<void> {
  try {
    await t.app.evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows()) w.destroy()
    })
  } catch {
    /* already gone */
  }
  await t.app.close().catch(() => {})
}

export { expect }
