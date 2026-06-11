/**
 * Background auto-update via electron-updater + GitHub Releases. Only runs in
 * packaged builds. Downloads a newer release in the background and, once ready,
 * notifies the renderer so it can offer "Restart to update". Never throws into
 * startup: every failure is swallowed and logged.
 *
 * Requires the build to be published with `electron-builder --publish always`
 * (package.json build.publish points at the GitHub repo), so the release
 * carries the latest.yml / latest-mac.yml metadata electron-updater reads.
 */

import { app, BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater

export function initAutoUpdate(): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  const send = (channel: string, payload?: unknown) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(channel, payload)
    }
  }

  autoUpdater.on('update-available', (info) => send('tiger:update:available', { version: info.version }))
  autoUpdater.on('update-downloaded', (info) =>
    send('tiger:update:downloaded', { version: info.version, notes: info.releaseNotes })
  )
  autoUpdater.on('error', () => {
    /* offline / no release / unsigned: ignore, manual check still works */
  })

  autoUpdater.checkForUpdates().catch(() => {
    /* never disturb startup */
  })

  // Re-check every 6 hours while the app stays open.
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000)
}

/** Quit and install a downloaded update (called from the renderer). */
export function quitAndInstall(): void {
  if (app.isPackaged) autoUpdater.quitAndInstall()
}
