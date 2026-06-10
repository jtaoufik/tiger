import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'
import { readCollection, readEnvironments } from './collection'
import { loadSettings, saveSettings, type Settings } from './settings'
import { applyNetworkSettings, getOAuthToken, sendHttp, track } from './http'
import { importFromDisk, saveExport, type ImportKind } from './importers'
import { appendHistory, clearHistory, readHistory } from './history'
import type { BuiltRequest } from '../core/request'
import type { AnalyticsEvent } from '../core/analytics'
import type { TigerAuth } from '../core/types'
import type { VarMap } from '../core/interpolate'

function createWindow(): void {
  const settings = loadSettings()
  const dark =
    settings.theme === 'dark' || (settings.theme === 'system' && nativeTheme.shouldUseDarkColors)

  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 880,
    minHeight: 560,
    show: false,
    backgroundColor: dark ? '#0f1117' : '#eef1f7',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    // Real OS-level translucency where the platform supports it; the renderer
    // also paints a CSS glass fallback so it looks right everywhere.
    vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
    backgroundMaterial: process.platform === 'win32' ? 'acrylic' : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  win.once('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('tiger:openCollection', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open a Tiger collection folder',
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    const root = result.filePaths[0]
    return {
      root,
      name: basename(root),
      requests: await readCollection(root),
      environments: await readEnvironments(root)
    }
  })

  ipcMain.handle('tiger:reload', async (_e, root: string) => readCollection(root))

  ipcMain.handle('tiger:readFile', async (_e, path: string) => {
    const { readFile } = await import('node:fs/promises')
    return readFile(path, 'utf8')
  })

  ipcMain.handle('tiger:writeFile', async (_e, path: string, content: string) => {
    const { writeFile, mkdir } = await import('node:fs/promises')
    const { dirname } = await import('node:path')
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content, 'utf8')
    return true
  })

  ipcMain.handle('tiger:deleteFile', async (_e, path: string) => {
    const { rm } = await import('node:fs/promises')
    await rm(path)
    return true
  })

  ipcMain.handle('tiger:listEnvironments', async (_e, root: string) => readEnvironments(root))

  ipcMain.handle('tiger:send', async (_e, built: BuiltRequest, timeoutMs: number) => {
    const res = await sendHttp(built, timeoutMs)
    appendHistory({
      id: randomUUID(),
      at: Date.now(),
      method: built.method,
      url: built.url,
      status: res.status,
      ok: res.status >= 200 && res.status < 300,
      timeMs: res.timeMs
    })
    return res
  })

  ipcMain.handle(
    'tiger:oauthToken',
    async (_e, auth: Extract<TigerAuth, { type: 'oauth2' }>, vars: VarMap) =>
      getOAuthToken(auth, vars)
  )

  ipcMain.handle('tiger:import', async (_e, kind: ImportKind) => importFromDisk(kind))
  ipcMain.handle('tiger:export', async (_e, defaultName: string, content: string) =>
    saveExport(defaultName, content)
  )

  ipcMain.handle('tiger:history:read', () => readHistory())
  ipcMain.handle('tiger:history:clear', () => clearHistory())

  ipcMain.handle('tiger:getSettings', () => loadSettings())
  ipcMain.handle('tiger:setSettings', (_e, patch: Partial<Settings>) => {
    const next = saveSettings(patch)
    applyNetworkSettings()
    return next
  })

  ipcMain.handle('tiger:track', (_e, event: AnalyticsEvent) => track(event))
}

app.whenReady().then(() => {
  // Packaged builds get the icon from the bundle; in dev, set the Dock icon
  // explicitly so the mascot shows instead of the stock Electron logo.
  if (process.platform === 'darwin' && !app.isPackaged) {
    try {
      app.dock.setIcon(join(__dirname, '../../build/icon.png'))
    } catch {
      /* missing icon asset must not block startup */
    }
  }
  registerIpc()
  applyNetworkSettings()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // On Windows/Linux, quitting when the last window closes is expected.
  if (process.platform !== 'darwin') app.quit()
})
