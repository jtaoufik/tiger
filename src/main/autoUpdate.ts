/**
 * In-app updates via electron-updater + GitHub Releases.
 *
 * The release workflow attaches latest.yml / latest-mac.yml / latest-linux.yml,
 * the .blockmap files and the mac zips to every tagged release, and
 * electron-updater's GitHub provider reads the repo's /releases/latest (never a
 * prerelease). Which installs update themselves is decided by
 * core/updateMode.ts: mac, the Windows NSIS install and the Linux AppImage do;
 * dev, the Microsoft Store, .deb, tar.gz and the Windows portable exe/zip keep
 * the website-link flow (http.ts checkForUpdate).
 *
 * The main process owns the update state (core/updateState.ts) and broadcasts
 * every change on `tiger:update:state`, so a window that loads late still
 * gets the current state through `tiger:update:getState`.
 *
 * electron-updater (and its dependency tree) is imported on demand: loading it
 * at module scope put it on the startup path before the window was created.
 * The background check starts a few seconds after launch (main/index.ts);
 * Help > Check for Updates calls checkNow, which awaits the same lazy load.
 *
 * Never throws into startup: failures become an `error` state that only the
 * Check for Updates dialog shows.
 */

import { app, BrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { resolveUpdateMode, type UpdateModeInfo } from '../core/updateMode'
import {
  friendlyUpdateError,
  INITIAL_UPDATE_STATE,
  reduceUpdate,
  type UpdateEvent,
  type UpdateState
} from '../core/updateState'
import { mainTranslator } from './i18n'
import { loadSettings, type Settings } from './settings'

type AutoUpdater = (typeof import('electron-updater'))['autoUpdater']

const SIX_HOURS = 6 * 60 * 60 * 1000

let modeInfo: UpdateModeInfo | null = null
let state: UpdateState = INITIAL_UPDATE_STATE
let updater: Promise<AutoUpdater> | null = null
let loaded: AutoUpdater | null = null
let started = false

function detectMode(): UpdateModeInfo {
  const nsisInstalled =
    process.platform === 'win32' &&
    // build.productName in package.json; NSIS names the uninstaller after it.
    existsSync(join(dirname(process.execPath), 'Uninstall Tiger.exe'))
  return resolveUpdateMode({
    isPackaged: app.isPackaged,
    platform: process.platform,
    windowsStore: process.windowsStore,
    env: process.env,
    nsisInstalled
  })
}

export function getUpdateMode(): UpdateModeInfo {
  if (!modeInfo) modeInfo = detectMode()
  return modeInfo
}

export function getUpdateState(): UpdateState {
  return state
}

function isAuto(): boolean {
  return getUpdateMode().mode === 'auto'
}

function dispatch(event: UpdateEvent): void {
  const next = reduceUpdate(state, event)
  if (next === state) return
  state = next
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('tiger:update:state', state)
  }
}

/** Import electron-updater once and wire its events; every caller awaits this. */
function loadUpdater(): Promise<AutoUpdater> {
  if (updater) return updater
  const pending = import('electron-updater').then((m) => {
    const autoUpdater = (m.default ?? m).autoUpdater
    autoUpdater.autoDownload = loadSettings().autoInstallUpdates !== false
    // "Later" means: install silently the next time Tiger quits.
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => dispatch({ type: 'checking' }))
    autoUpdater.on('update-available', (info) =>
      dispatch({ type: 'available', version: info.version, autoDownload: autoUpdater.autoDownload })
    )
    autoUpdater.on('update-not-available', () => dispatch({ type: 'not-available' }))
    autoUpdater.on('download-progress', (p) => dispatch({ type: 'progress', percent: p.percent }))
    autoUpdater.on('update-downloaded', (info) => dispatch({ type: 'downloaded', version: info.version }))
    autoUpdater.on('error', (err) => dispatch({ type: 'error', message: friendlyUpdateError(err, mainTranslator()) }))
    loaded = autoUpdater
    return autoUpdater
  })
  // A failed import may be retried by the next check.
  pending.catch(() => {
    if (updater === pending) updater = null
  })
  updater = pending
  return pending
}

/** Background check + 6-hour re-check. Called a few seconds after launch. */
export async function initAutoUpdate(): Promise<void> {
  if (!isAuto() || started) return
  started = true
  await checkNow()
  // Re-check every 6 hours while the app stays open.
  setInterval(() => void checkNow(), SIX_HOURS)
}

/** Settings changed: follow the "Install updates automatically" toggle. */
export function applyUpdateSettings(settings: Pick<Settings, 'autoInstallUpdates'>): void {
  if (!isAuto()) return
  // Not loaded yet: loadUpdater reads the saved setting when it loads.
  if (loaded) loaded.autoDownload = settings.autoInstallUpdates !== false
}

/** Check now (Help > Check for Updates). Resolves with the state afterwards. */
export async function checkNow(): Promise<UpdateState> {
  if (!isAuto()) return state
  try {
    const autoUpdater = await loadUpdater()
    await autoUpdater.checkForUpdates()
  } catch (err) {
    dispatch({ type: 'error', message: friendlyUpdateError(err, mainTranslator()) })
  }
  return state
}

/** Download an available update when automatic install is off. */
export function downloadNow(): void {
  if (!isAuto() || state.status !== 'available') return
  dispatch({ type: 'download-started' })
  loadUpdater()
    .then((autoUpdater) => autoUpdater.downloadUpdate())
    .catch((err) => {
      dispatch({ type: 'error', message: friendlyUpdateError(err, mainTranslator()) })
    })
}

/** A downloaded update is waiting: Restart now would install it. */
export function canInstallNow(): boolean {
  return isAuto() && state.status === 'downloaded'
}

/** Quit and install a downloaded update (Restart now). */
export async function quitAndInstall(): Promise<void> {
  if (isAuto() && state.status === 'downloaded') (await loadUpdater()).quitAndInstall()
}
