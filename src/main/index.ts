import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, screen, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { readCollection, readEnvironments, readOpenedCollection } from './collection'
import { buildAppMenu } from './menu'
import { loadSettings, saveSettings, type Settings } from './settings'
import {
  applyNetworkSettings,
  cancelSend,
  checkForUpdate,
  getOAuthToken,
  sendHttp,
  track
} from './http'
import { importFromDisk, saveExport, type ImportKind } from './importers'
import { appendHistory, clearHistory, readHistory } from './history'
import { clearCookies } from './cookieJar'
import { initAutoUpdate, quitAndInstall } from './autoUpdate'
import {
  gitAvailable,
  gitBranches,
  gitCheckout,
  gitClone,
  gitCommitAll,
  gitDiff,
  gitDiscardAll,
  gitInit,
  gitLog,
  gitPull,
  gitPush,
  gitSetRemote,
  gitStatus,
  gitSync,
  gitSyncResolve,
  repoNameFromUrl
} from './git'
import { sanitizeCollectionName } from '../core/newCollection'
import type { BuiltRequest } from '../core/request'
import type { AnalyticsEvent } from '../core/analytics'
import type { TigerAuth } from '../core/types'
import type { VarMap } from '../core/interpolate'

/** Was this saved position still visible on a connected display? */
function isOnScreen(state: { x?: number; y?: number; width: number; height: number }): boolean {
  if (state.x === undefined || state.y === undefined) return false
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea
    return (
      state.x! < a.x + a.width &&
      state.x! + state.width > a.x &&
      state.y! < a.y + a.height &&
      state.y! + state.height > a.y
    )
  })
}

/** Dialogs are parented to the app window so they can't pop up behind it (Windows). */
function parentWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

/**
 * The renderer reports whether any request has unsaved edits; the close handler
 * uses it to warn before the window (and the edits) go away.
 */
let hasUnsavedChanges = false

function createWindow(): void {
  const settings = loadSettings()
  const dark =
    settings.theme === 'dark' || (settings.theme === 'system' && nativeTheme.shouldUseDarkColors)

  // Reopen at the last size/position; fall back to a sensible default and ignore
  // an off-screen position (e.g. an external monitor that's no longer attached).
  const saved = settings.window
  const placeable = saved && isOnScreen(saved)

  // macOS picks up the app icon from the bundle (.icns); on Windows and Linux
  // the running window's taskbar icon comes from BrowserWindow.icon, so point
  // it explicitly at the bundled PNG. This works in both dev and packaged
  // builds (the file ships under the asar and is resolved off __dirname).
  const winIcon =
    process.platform !== 'darwin' ? join(__dirname, '../../build/icon.png') : undefined

  const win = new BrowserWindow({
    width: saved?.width ?? 1180,
    height: saved?.height ?? 760,
    x: placeable ? saved!.x : undefined,
    y: placeable ? saved!.y : undefined,
    minWidth: 880,
    minHeight: 560,
    show: false,
    icon: winIcon,
    backgroundColor: dark ? '#0f1117' : '#eef1f7',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    // Real OS-level translucency where the platform supports it; the renderer
    // also paints a CSS glass fallback so it looks right everywhere.
    vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
    // No Windows `backgroundMaterial: 'acrylic'`: the DWM acrylic backdrop breaks
    // native edge-resize and maximize on Windows 11. The renderer paints a CSS
    // glass layer instead, and `backgroundColor` above covers the window base.
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  if (saved?.maximized) win.maximize()

  win.once('ready-to-show', () => win.show())

  // Remember the window geometry. getNormalBounds() reports the restored size even
  // while maximized, so unmaximizing later returns to a sensible window. Debounced
  // so a drag-resize doesn't hammer the settings file.
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  const rememberBounds = (): void => {
    if (win.isDestroyed() || win.isMinimized()) return
    const b = win.getNormalBounds()
    saveSettings({
      window: { width: b.width, height: b.height, x: b.x, y: b.y, maximized: win.isMaximized() }
    })
  }
  const scheduleRemember = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(rememberBounds, 400)
  }
  win.on('resize', scheduleRemember)
  win.on('move', scheduleRemember)
  win.on('maximize', scheduleRemember)
  win.on('unmaximize', scheduleRemember)
  let closeConfirmed = false
  win.on('close', (e) => {
    // Unsaved request edits die with the window; warn once, close on confirm.
    if (hasUnsavedChanges && !closeConfirmed) {
      e.preventDefault()
      dialog
        .showMessageBox(win, {
          type: 'warning',
          message: 'You have unsaved changes',
          detail: 'Closing now discards edits that are not saved yet.',
          buttons: ['Close Anyway', 'Keep Editing'],
          defaultId: 1,
          cancelId: 1
        })
        .then(({ response }) => {
          if (response === 0) {
            closeConfirmed = true
            win.close()
          }
        })
      return
    }
    if (saveTimer) clearTimeout(saveTimer)
    rememberBounds()
  })

  // The macOS traffic lights disappear in fullscreen; tell the renderer so it
  // can drop the titlebar inset it reserves for them.
  const sendFullscreen = (state: boolean) => (): void => {
    if (!win.isDestroyed()) win.webContents.send('tiger:fullscreen', state)
  }
  win.on('enter-full-screen', sendFullscreen(true))
  win.on('leave-full-screen', sendFullscreen(false))

  // Native right-click edit menu on text fields (and for text selections).
  // Windows users in particular reach for right-click → Paste; without this
  // Electron shows nothing at all.
  win.webContents.on('context-menu', (_e, params) => {
    if (!params.isEditable && !params.selectionText) return
    const menu = Menu.buildFromTemplate(
      params.isEditable
        ? [
            { role: 'undo', enabled: params.editFlags.canUndo },
            { role: 'redo', enabled: params.editFlags.canRedo },
            { type: 'separator' },
            { role: 'cut', enabled: params.editFlags.canCut },
            { role: 'copy', enabled: params.editFlags.canCopy },
            { role: 'paste', enabled: params.editFlags.canPaste },
            { type: 'separator' },
            { role: 'selectAll', enabled: params.editFlags.canSelectAll }
          ]
        : [{ role: 'copy', enabled: params.editFlags.canCopy }]
    )
    menu.popup({ window: win })
  })

  // ⌘W / Ctrl+W closes the active tab, not the window: the "Close Tab" menu item
  // owns that accelerator (see menu.ts) and forwards the intent to the renderer.

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
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
    const result = await dialog.showOpenDialog(parentWindow()!, {
      title: 'Open a Tiger collection folder',
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    return readOpenedCollection(result.filePaths[0])
  })

  ipcMain.handle('tiger:newCollection', async (_e, name: string) => {
    const folder = sanitizeCollectionName(name)
    if (!folder) return null
    const result = await dialog.showOpenDialog(parentWindow()!, {
      title: `Choose where to create "${folder}"`,
      buttonLabel: 'Create here',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    const { mkdir } = await import('node:fs/promises')
    const target = join(result.filePaths[0], folder)
    await mkdir(target, { recursive: true })
    return readOpenedCollection(target)
  })

  // Dialog-less open for session restore; null when the root is gone.
  ipcMain.handle('tiger:openPath', async (_e, root: string) => {
    try {
      const { stat } = await import('node:fs/promises')
      if (!(await stat(root)).isDirectory()) return null
      return await readOpenedCollection(root)
    } catch {
      return null
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

  ipcMain.handle('tiger:moveFile', async (_e, from: string, to: string) => {
    const { rename, mkdir, access } = await import('node:fs/promises')
    const { dirname } = await import('node:path')
    // Never silently overwrite an existing file or folder at the destination.
    try {
      await access(to)
      throw new Error(`Already exists: ${to}`)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
    await mkdir(dirname(to), { recursive: true })
    await rename(from, to)
    return true
  })

  ipcMain.handle('tiger:deleteFile', async (_e, path: string) => {
    const { rm } = await import('node:fs/promises')
    await rm(path)
    return true
  })

  ipcMain.handle('tiger:listEnvironments', async (_e, root: string) => readEnvironments(root))

  ipcMain.handle('tiger:cancelSend', (_e, key: string) => cancelSend(key))

  ipcMain.handle('tiger:send', async (_e, built: BuiltRequest, timeoutMs: number, key?: string) => {
    const res = await sendHttp(built, timeoutMs, key)
    appendHistory({
      id: randomUUID(),
      at: Date.now(),
      method: built.method,
      url: built.url,
      status: res.status,
      ok: res.status >= 200 && res.status < 300,
      timeMs: res.timeMs,
      requestId: key
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

  ipcMain.handle('tiger:version', () => app.getVersion())
  ipcMain.handle('tiger:checkUpdate', () => checkForUpdate(app.getVersion()))
  ipcMain.handle('tiger:installUpdate', () => quitAndInstall())

  ipcMain.handle('tiger:git:check', () => gitAvailable())
  ipcMain.handle('tiger:git:status', (_e, root: string) => gitStatus(root))
  ipcMain.handle('tiger:git:diff', (_e, root: string) => gitDiff(root))
  ipcMain.handle('tiger:git:commit', (_e, root: string, message: string) =>
    gitCommitAll(root, message)
  )
  ipcMain.handle('tiger:git:pull', (_e, root: string) => gitPull(root))
  ipcMain.handle('tiger:git:push', (_e, root: string) => gitPush(root))
  ipcMain.handle('tiger:git:init', (_e, root: string) => gitInit(root))
  ipcMain.handle('tiger:git:sync', (_e, root: string, message: string) => gitSync(root, message))
  ipcMain.handle('tiger:git:syncResolve', (_e, root: string, prefer: 'mine' | 'theirs', message: string) =>
    gitSyncResolve(root, prefer, message)
  )
  ipcMain.handle('tiger:git:setRemote', (_e, root: string, url: string) => gitSetRemote(root, url))
  ipcMain.handle('tiger:git:branches', (_e, root: string) => gitBranches(root))
  ipcMain.handle('tiger:git:checkout', (_e, root: string, branch: string, create: boolean) =>
    gitCheckout(root, branch, create)
  )
  ipcMain.handle('tiger:git:log', (_e, root: string) => gitLog(root))
  ipcMain.handle('tiger:git:discard', (_e, root: string) => gitDiscardAll(root))
  ipcMain.handle('tiger:git:clone', async (_e, url: string) => {
    const dest = await dialog.showOpenDialog(parentWindow()!, {
      title: 'Choose where to clone the collection',
      properties: ['openDirectory', 'createDirectory']
    })
    if (dest.canceled || !dest.filePaths[0]) return null
    const { join: pjoin } = await import('node:path')
    const target = pjoin(dest.filePaths[0], repoNameFromUrl(url))
    const result = await gitClone(url, target)
    if (!result.ok) return { error: result.message }
    return readOpenedCollection(target)
  })
  ipcMain.handle('tiger:openExternal', (_e, url: string) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
  })
  // Renderer paths are normalized to forward slashes (see collection.ts);
  // Explorer's select-item call wants native backslashes.
  ipcMain.handle('tiger:reveal', (_e, path: string) =>
    shell.showItemInFolder(process.platform === 'win32' ? path.replace(/\//g, '\\') : path)
  )

  ipcMain.on('tiger:dirtyState', (_e, dirty: boolean) => {
    hasUnsavedChanges = dirty
  })

  ipcMain.handle(
    'tiger:pickFile',
    async (_e, filters: { name: string; extensions: string[] }[]) => {
      const result = await dialog.showOpenDialog(parentWindow()!, {
        properties: ['openFile'],
        filters
      })
      if (result.canceled || !result.filePaths[0]) return null
      return result.filePaths[0]
    }
  )

  ipcMain.handle('tiger:cookies:clear', () => {
    clearCookies()
  })

  ipcMain.handle('tiger:mcpInfo', () => {
    const serverPath = app.isPackaged
      ? join(process.resourcesPath, 'app.asar.unpacked', 'out', 'mcp', 'server.mjs')
      : join(app.getAppPath(), 'out', 'mcp', 'server.mjs')
    return { serverPath }
  })
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
  // Proxy authentication: answer 407 challenges with the configured credentials
  // instead of letting Electron fail the request silently.
  app.on('login', (event, _webContents, _request, authInfo, callback) => {
    const { proxyUsername, proxyPassword } = loadSettings()
    if (authInfo.isProxy && proxyUsername) {
      event.preventDefault()
      callback(proxyUsername, proxyPassword)
    }
  })

  // Mutual TLS: when a server requests a client certificate, pick the one whose
  // subject contains the configured filter text (first in the list otherwise).
  app.on('select-client-certificate', (event, _webContents, _url, list, callback) => {
    event.preventDefault()
    const filter = loadSettings().clientCertSubject
    const match = filter ? list.find((cert) => cert.subjectName.includes(filter)) : undefined
    callback(match ?? list[0])
  })

  registerIpc()
  applyNetworkSettings()
  buildAppMenu()
  createWindow()
  initAutoUpdate()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // On Windows/Linux, quitting when the last window closes is expected.
  if (process.platform !== 'darwin') app.quit()
})
