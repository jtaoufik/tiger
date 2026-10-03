import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, screen, shell } from 'electron'
import { perfMark, perfRendererMark } from './perf'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { readCollection, readEnvironments, readOpenedCollection } from './collection'
import { buildAppMenu } from './menu'
import { broadcastLocale, mainLocale, mainT, resolveAppLocale, setMainLocale } from './i18n'
import { loadSettings, saveSettings, type Settings } from './settings'
import {
  applyNetworkSettings,
  cancelSend,
  checkForUpdate,
  getOAuthToken,
  forgetOAuthToken,
  sendHttp,
  track
} from './http'
import { importFromDisk, importPaths, saveExport, type ImportKind } from './importers'
import { saveCollectionFiles } from './saveCollection'
import { readTextFile } from './textFile'
import type { CollectionFile } from '../core/collectionFiles'
import { appendHistory, clearHistory, readHistory } from './history'
import { clearCookies } from './cookieJar'
import {
  applyUpdateSettings,
  checkNow,
  downloadNow,
  getUpdateMode,
  getUpdateState,
  initAutoUpdate,
  quitAndInstall,
  canInstallNow
} from './autoUpdate'
import { blockExternalNetwork, isE2E } from './e2eGuard'
import {
  enterHeadlessMode,
  headlessWebPreferences,
  headlessWindowOptions,
  isHeadless,
  mayShowWindow
} from './headless'
import {
  gitAvailable,
  gitBranches,
  gitCheckout,
  gitClone,
  gitCommitAll,
  gitConflicts,
  gitDiff,
  gitDiffFile,
  gitDiscard,
  gitFetch,
  gitInit,
  gitLog,
  gitPull,
  gitPush,
  gitRequestNames,
  gitSetIdentity,
  gitSetRemote,
  gitStatus,
  gitSync,
  gitSyncResolve,
  gitUndoDiscard,
  repoNameFromUrl
} from './git'
import { sanitizeCollectionName } from '../core/newCollection'
import { resolveMcpLaunch, type McpInfo } from '../mcp/launch'
import { disposeScriptHost, runIsolatedScript } from './scriptHost'
import { appWindows, targetAppWindow } from './windows'
import { redactedUrl, type BuiltRequest } from '../core/request'
import type { AnalyticsEvent } from '../core/analytics'
import type { TigerAuth } from '../core/types'
import type { VarMap } from '../core/interpolate'

perfMark('main:entry')

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
  return targetAppWindow()
}

/**
 * The renderer reports whether any request has unsaved edits; the close handler
 * uses it to warn before the window (and the edits) go away.
 */
let hasUnsavedChanges = false
/** The user chose to restart for an update and drop unsaved edits: closing must not ask again. */
let discardUnsavedForUpdate = false

/** e2e and benchmark runs: windows stay hidden and the app never activates. */
const headless = isHeadless()
if (headless) {
  try {
    enterHeadlessMode(app)
  } catch {
    /* not available before ready on this version: whenReady repeats it */
  }
}

// Windows groups a running app with its pinned and Start menu shortcuts by
// this id; the installer stamps the shortcuts with the appId. (The Store
// package carries its own identity.)
if (process.platform === 'win32' && !process.windowsStore) app.setAppUserModelId('com.taoufikjabbari.tiger')

// One Tiger per profile. Windows (unlike macOS) starts a second process on
// every launch from the Start menu or taskbar; two processes overwrite each
// other's settings and session, and an update installer closes both. The
// second launch now brings the running window forward instead.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // The user launched Tiger again: show the window they already have
    // (never in an automated run, which has no user to show it to).
    const win = appWindows()[0]
    if (!win || !mayShowWindow(headless)) return
    if (win.isMinimized()) win.restore()
    if (mayShowWindow(headless)) win.show()
    if (mayShowWindow(headless)) win.focus()
  })
}

/**
 * The title bar, native menus and dialogs follow Tiger's theme, not only the
 * OS one: a dark Tiger used to sit in a white Windows frame.
 */
function applyNativeTheme(theme: Settings['theme']): void {
  nativeTheme.themeSource = theme
  for (const win of appWindows()) win.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#0f1117' : '#eef1f7')
}

function createWindow(): BrowserWindow {
  const settings = loadSettings()
  const dark =
    settings.theme === 'dark' || (settings.theme === 'system' && nativeTheme.shouldUseDarkColors)

  // Reopen at the last size/position; fall back to a sensible default and ignore
  // an off-screen position (e.g. an external monitor that's no longer attached).
  const saved = settings.window
  const placeable = saved && isOnScreen(saved)
  const workArea = screen.getPrimaryDisplay().workAreaSize

  // macOS picks up the app icon from the bundle (.icns); on Windows and Linux
  // the running window's taskbar icon comes from BrowserWindow.icon, so point
  // it explicitly at the bundled PNG. This works in both dev and packaged
  // builds (the file ships under the asar and is resolved off __dirname).
  const winIcon =
    process.platform !== 'darwin' ? join(__dirname, '../../build/icon.png') : undefined

  const win = new BrowserWindow({
    width: saved?.width ?? Math.min(1180, workArea.width),
    height: saved?.height ?? Math.min(760, workArea.height),
    x: placeable ? saved!.x : undefined,
    y: placeable ? saved!.y : undefined,
    // Never larger than the screen: 1366x768 at 150% scaling leaves about
    // 910x480, and a taller minimum pushed the bottom of Tiger off-screen.
    // Outer sizes: on Windows the title bar, the menu bar and the borders take
    // about 16x75 px of them, so the minimum is larger there to leave the
    // same room for the request and the response.
    minWidth: Math.min(process.platform === 'win32' ? 896 : 880, workArea.width),
    minHeight: Math.min(process.platform === 'win32' ? 620 : 560, workArea.height),
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
      sandbox: false,
      // The renderer loads this language's catalog before its first paint, so
      // a non-English UI never flashes English first.
      additionalArguments: [`--tiger-locale=${mainLocale()}`],
      ...headlessWebPreferences(headless)
    },
    ...headlessWindowOptions(headless)
  })

  win.once('ready-to-show', () => {
    perfMark('main:ready-to-show')
    // Automated runs (e2e, startup benchmarks) never show the window: nothing
    // flashes on screen or steals focus on the machine running them.
    // maximize() shows a hidden window on Windows, so it waits for the first
    // paint too: called earlier, the window appeared empty, before its content.
    if (saved?.maximized && mayShowWindow(headless)) win.maximize()
    if (mayShowWindow(headless)) win.show()
  })
  perfMark('main:window-created')

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
    if (hasUnsavedChanges && !closeConfirmed && !discardUnsavedForUpdate) {
      e.preventDefault()
      dialog
        .showMessageBox(win, {
          type: 'warning',
          message: mainT('main.dialog.unsavedTitle'),
          detail: mainT('main.dialog.unsavedDetail'),
          buttons: [mainT('main.dialog.closeAnyway'), mainT('main.dialog.keepEditing')],
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

  // The hidden script host must not outlive the app window, or it would keep
  // the app alive on Windows/Linux (window-all-closed never fires).
  win.on('closed', () => {
    if (appWindows().every((w) => w === win)) disposeScriptHost()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

/**
 * Where imported collections are saved: Documents/Tiger, a place users find
 * and back up. End-to-end runs keep them inside their throwaway profile.
 */
function collectionsHome(): string {
  return isE2E() ? join(app.getPath('userData'), 'Collections') : join(app.getPath('documents'), 'Tiger')
}

function registerIpc(): void {
  ipcMain.handle('tiger:openCollection', async () => {
    const result = await dialog.showOpenDialog(parentWindow()!, {
      title: mainT('main.dialog.openCollection'),
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    return readOpenedCollection(result.filePaths[0])
  })

  ipcMain.handle('tiger:newCollection', async (_e, name: string) => {
    const folder = sanitizeCollectionName(name)
    if (!folder) return null
    const result = await dialog.showOpenDialog(parentWindow()!, {
      title: mainT('main.dialog.newCollection', { name: folder }),
      buttonLabel: mainT('main.dialog.createHere'),
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

  // Decoded like every other read: a BOM or UTF-16 file from a Windows tool reads as its text.
  ipcMain.handle('tiger:readFile', async (_e, path: string) => readTextFile(path))

  ipcMain.handle('tiger:writeFile', async (_e, path: string, content: string) => {
    const { writeFile, mkdir } = await import('node:fs/promises')
    const { dirname } = await import('node:path')
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content, 'utf8')
    return true
  })

  ipcMain.handle('tiger:moveFile', async (_e, from: string, to: string) => {
    const { rename, mkdir, access, stat } = await import('node:fs/promises')
    const { dirname } = await import('node:path')
    let exists = true
    try {
      await access(to)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      exists = false
    }
    // Never silently overwrite an existing file or folder at the destination,
    // unless it is the source itself: "users" -> "Users" on Windows and macOS,
    // whose disks ignore case, used to fail with "Already exists".
    const sameEntry = async (): Promise<boolean> => {
      if (from.toLowerCase() !== to.toLowerCase()) return false
      const [a, b] = await Promise.all([stat(from), stat(to)])
      return a.dev === b.dev && a.ino === b.ino
    }
    if (exists && !(await sameEntry())) throw new Error(`Already exists: ${to}`)
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

  // Collection scripts run in the isolated script host, never in this window.
  ipcMain.handle('tiger:script:run', (_e, job: unknown) => runIsolatedScript(job))

  ipcMain.handle('tiger:cancelSend', (_e, key: string) => cancelSend(key))

  ipcMain.handle(
    'tiger:send',
    async (_e, built: BuiltRequest, timeoutMs: number, key?: string, options?: { record?: boolean }) => {
      const res = await sendHttp(built, timeoutMs, key)
      // A load test fires hundreds of sends: they must not push the user's real
      // requests out of the 200-entry history.
      if (options?.record === false) return res
      appendHistory({
        id: randomUUID(),
        at: Date.now(),
        method: built.method,
        // An API key sent in the query string never lands in history.json.
        url: redactedUrl(built),
        status: res.status,
        ok: res.status >= 200 && res.status < 300,
        timeMs: res.timeMs,
        requestId: key
      })
      return res
    }
  )

  // A response body saved as the bytes received: sent as text, a PDF or an
  // image would be re-encoded and corrupted.
  ipcMain.handle('tiger:saveResponse', async (_e, defaultName: string, base64: string) => {
    const result = await dialog.showSaveDialog(parentWindow()!, {
      title: mainT('main.dialog.saveResponse'),
      defaultPath: String(defaultName).replace(/[\\/:*?"<>|]/g, '-')
    })
    if (result.canceled || !result.filePath) return null
    const { writeFile } = await import('node:fs/promises')
    await writeFile(result.filePath, Buffer.from(String(base64), 'base64'))
    return result.filePath
  })

  ipcMain.handle(
    'tiger:oauthToken',
    async (_e, auth: Extract<TigerAuth, { type: 'oauth2' }>, vars: VarMap) =>
      getOAuthToken(auth, vars)
  )
  ipcMain.handle(
    'tiger:oauthForget',
    (_e, auth: Extract<TigerAuth, { type: 'oauth2' }>, vars: VarMap) => forgetOAuthToken(auth, vars)
  )

  // An import (or the sample) saved as a real collection folder.
  ipcMain.handle('tiger:saveCollection', async (_e, name: string, files: CollectionFile[]) => {
    const root = await saveCollectionFiles(collectionsHome(), String(name), Array.isArray(files) ? files : [])
    return readOpenedCollection(root)
  })

  ipcMain.handle('tiger:import', async (_e, kind: ImportKind) => importFromDisk(kind))
  // Drag and drop: the renderer resolves dropped File objects to paths.
  ipcMain.handle('tiger:importPaths', async (_e, paths: unknown) =>
    Array.isArray(paths) ? importPaths(paths.filter((p): p is string => typeof p === 'string')) : null
  )
  ipcMain.handle('tiger:export', async (_e, defaultName: string, content: string) =>
    saveExport(defaultName, content)
  )

  ipcMain.handle('tiger:history:read', () => readHistory())
  ipcMain.handle('tiger:history:clear', () => clearHistory())

  ipcMain.handle('tiger:getSettings', () => loadSettings())
  ipcMain.handle('tiger:setSettings', (_e, patch: Partial<Settings>) => {
    const next = saveSettings(patch)
    applyNetworkSettings()
    applyUpdateSettings(next)
    if (patch.theme !== undefined) applyNativeTheme(next.theme)
    if (patch.language !== undefined && setMainLocale(resolveAppLocale(next.language))) {
      // Live switch: the native menu is rebuilt and every window re-renders.
      buildAppMenu()
      broadcastLocale(mainLocale())
    }
    return next
  })
  ipcMain.handle('tiger:locale', () => mainLocale())

  ipcMain.handle('tiger:track', (_e, event: AnalyticsEvent) => track(event))

  ipcMain.handle('tiger:version', () => app.getVersion())
  ipcMain.handle('tiger:checkUpdate', () => checkForUpdate(app.getVersion()))
  ipcMain.handle('tiger:installUpdate', async () => {
    if (!canInstallNow()) return
    // Ask before the installer starts, never after: on Windows it force-closes
    // a Tiger whose window answered "Keep editing", and the edits with it.
    if (hasUnsavedChanges) {
      const options = {
        type: 'warning' as const,
        message: mainT('main.dialog.unsavedTitle'),
        detail: mainT('main.dialog.updateUnsavedDetail'),
        buttons: [mainT('main.dialog.restartAnyway'), mainT('main.dialog.keepEditing')],
        defaultId: 1,
        cancelId: 1
      }
      const win = parentWindow()
      const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options)
      if (response !== 0) return
      discardUnsavedForUpdate = true
    }
    await quitAndInstall()
  })
  ipcMain.handle('tiger:update:mode', () => getUpdateMode())
  ipcMain.handle('tiger:update:getState', () => getUpdateState())
  ipcMain.handle('tiger:update:check', () => checkNow())
  ipcMain.handle('tiger:update:download', () => downloadNow())

  ipcMain.handle('tiger:git:check', () => gitAvailable())
  ipcMain.handle('tiger:git:status', (_e, root: string) => gitStatus(root))
  ipcMain.handle('tiger:git:diff', (_e, root: string) => gitDiff(root))
  ipcMain.handle('tiger:git:commit', (_e, root: string, message: string) =>
    gitCommitAll(root, message)
  )
  ipcMain.handle('tiger:git:pull', (_e, root: string) => gitPull(root))
  ipcMain.handle('tiger:git:push', (_e, root: string) => gitPush(root))
  ipcMain.handle('tiger:git:init', (_e, root: string) => gitInit(root))
  ipcMain.handle('tiger:git:sync', (e, root: string, message: string) =>
    gitSync(root, message, (phase) => {
      if (!e.sender.isDestroyed()) e.sender.send('tiger:git:progress', { root, phase })
    })
  )
  ipcMain.handle(
    'tiger:git:syncResolve',
    (
      _e,
      root: string,
      prefer: 'mine' | 'theirs',
      message: string,
      choices?: Record<string, 'mine' | 'theirs'>
    ) => gitSyncResolve(root, prefer, message, choices)
  )
  ipcMain.handle('tiger:git:fetch', (_e, root: string) => gitFetch(root))
  ipcMain.handle('tiger:git:diffFile', (_e, root: string, path: string) => gitDiffFile(root, path))
  ipcMain.handle('tiger:git:requestNames', (_e, root: string, paths: string[]) =>
    gitRequestNames(root, paths)
  )
  ipcMain.handle('tiger:git:conflicts', (_e, root: string) => gitConflicts(root))
  ipcMain.handle('tiger:git:setIdentity', (_e, root: string, name: string, email: string) =>
    gitSetIdentity(root, name, email)
  )
  ipcMain.handle('tiger:git:undoDiscard', (_e, root: string, token: string) =>
    gitUndoDiscard(root, token)
  )
  ipcMain.handle('tiger:git:setRemote', (_e, root: string, url: string) => gitSetRemote(root, url))
  ipcMain.handle('tiger:git:branches', (_e, root: string) => gitBranches(root))
  ipcMain.handle('tiger:git:checkout', (_e, root: string, branch: string, create: boolean) =>
    gitCheckout(root, branch, create)
  )
  ipcMain.handle('tiger:git:log', (_e, root: string) => gitLog(root))
  ipcMain.handle('tiger:git:discard', (_e, root: string, paths?: string[]) => gitDiscard(root, paths))
  ipcMain.handle('tiger:git:clone', async (_e, url: string) => {
    const dest = await dialog.showOpenDialog(parentWindow()!, {
      title: mainT('main.dialog.cloneTitle'),
      buttonLabel: mainT('main.dialog.saveHere'),
      properties: ['openDirectory', 'createDirectory']
    })
    if (dest.canceled || !dest.filePaths[0]) return null
    const { join: pjoin } = await import('node:path')
    const target = pjoin(dest.filePaths[0], repoNameFromUrl(url))
    const result = await gitClone(url, target)
    if (!result.ok) return { error: result.message, code: result.code }
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

  ipcMain.on('tiger:perf', (_e, name: string, at: number) => perfRendererMark(name, at))

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

  // How an AI client starts the MCP server: Tiger's own executable run as Node
  // (src/mcp/launch.ts). An install that moves (an AppImage's mount, the
  // portable exe's temporary folder) gets a copy of the server under userData,
  // refreshed at each start and whenever Settings shows the snippet.
  const bundledServer = app.isPackaged
    ? join(process.resourcesPath, 'app.asar.unpacked', 'out', 'mcp', 'server.mjs')
    : join(app.getAppPath(), 'out', 'mcp', 'server.mjs')
  const { copy: needsCopy, ...mcpInfo } = resolveMcpLaunch({
    platform: process.platform,
    windowsStore: process.windowsStore,
    env: process.env,
    execPath: process.execPath,
    bundledServer,
    copiedServer: join(app.getPath('userData'), 'mcp', 'server.mjs')
  })
  const refreshMcpServer = async (): Promise<void> => {
    if (!needsCopy) return
    const { copyFile, mkdir, rename } = await import('node:fs/promises')
    const { dirname } = await import('node:path')
    try {
      await mkdir(dirname(mcpInfo.serverPath), { recursive: true })
      // Renamed into place, so a client starting the server never reads half a file.
      const temp = `${mcpInfo.serverPath}.${process.pid}.tmp`
      await copyFile(bundledServer, temp)
      await rename(temp, mcpInfo.serverPath)
    } catch {
      /* the snippet still shows; the AI client reports the missing file */
    }
  }
  void refreshMcpServer()
  ipcMain.handle('tiger:mcpInfo', async (): Promise<McpInfo> => {
    await refreshMcpServer()
    return mcpInfo
  })
}

app.whenReady().then(() => {
  perfMark('main:ready')
  if (headless) enterHeadlessMode(app)
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

  if (isE2E()) blockExternalNetwork()
  registerIpc()
  applyNetworkSettings()
  nativeTheme.themeSource = loadSettings().theme
  setMainLocale(resolveAppLocale(loadSettings().language))
  buildAppMenu()
  const win = createWindow()

  // Nothing below is needed for the first frame: run it once the window has
  // painted instead of in front of it.
  win.once('ready-to-show', () => {
    // Packaged builds get the icon from the bundle; in dev, set the Dock icon
    // explicitly so the mascot shows instead of the stock Electron logo.
    // Decoding the 1024 px PNG blocks the main process for ~60 ms, which used
    // to sit in front of createWindow and then in front of the page load.
    if (process.platform === 'darwin' && !app.isPackaged && !headless) {
      setImmediate(() => {
        try {
          app.dock.setIcon(join(__dirname, '../../build/icon.png'))
        } catch {
          /* missing icon asset must not block startup */
        }
      })
    }
  })
  // The background update check (and loading electron-updater) waits until
  // the first window has painted and settled.
  setTimeout(() => void initAutoUpdate(), 5000)

  app.on('activate', () => {
    if (appWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // On Windows/Linux, quitting when the last window closes is expected.
  if (process.platform !== 'darwin') app.quit()
})
