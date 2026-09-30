import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'

// autoUpdate.ts wires electron-updater to the main-process update state. Stub
// electron, electron-updater and settings so the wiring runs without Electron.
const h = vi.hoisted(() => ({
  app: { isPackaged: true, getName: () => 'Tiger' },
  sent: [] as unknown[],
  settings: { autoInstallUpdates: true } as { autoInstallUpdates?: boolean },
  updater: null as unknown as EventEmitter & Record<string, unknown>,
  /** Reads of electron-updater's autoUpdater: 0 means the lazy import never ran. */
  loads: 0
}))

vi.mock('electron', () => ({
  app: h.app,
  BrowserWindow: {
    getAllWindows: () => [
      { isDestroyed: () => false, webContents: { send: (_c: string, s: unknown) => h.sent.push(s) } }
    ]
  }
}))
vi.mock('electron-updater', () => ({
  default: {
    get autoUpdater() {
      h.loads++
      return h.updater
    }
  }
}))
vi.mock('../../src/main/settings', () => ({ loadSettings: () => h.settings }))

const realPlatform = process.platform

/** checkForUpdates calls so far; 0 when electron-updater was never imported. */
const checks = () => (h.updater.checkForUpdates as ReturnType<typeof vi.fn>).mock.calls.length
/** Let the lazy import and the promise chains behind it settle. */
const settle = () => vi.advanceTimersByTimeAsync(0)

async function load(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: platform })
  vi.resetModules()
  return import('../../src/main/autoUpdate')
}

describe('autoUpdate (main)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    h.sent.length = 0
    h.app.isPackaged = true
    h.settings = { autoInstallUpdates: true }
    vi.clearAllMocks()
    h.loads = 0
    h.updater = Object.assign(new EventEmitter(), {
      autoDownload: true,
      autoInstallOnAppQuit: false,
      checkForUpdates: vi.fn().mockResolvedValue(null),
      downloadUpdate: vi.fn().mockResolvedValue([]),
      quitAndInstall: vi.fn()
    }) as never
  })
  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(process, 'platform', { value: realPlatform })
    delete (process as { windowsStore?: boolean }).windowsStore
  })

  it('does nothing in dev: no check, manual mode', async () => {
    h.app.isPackaged = false
    const m = await load('darwin')
    await m.initAutoUpdate()
    await m.checkNow()
    expect(m.getUpdateMode()).toEqual({ mode: 'manual', reason: 'dev' })
    expect(checks()).toBe(0)
    expect(h.loads).toBe(0) // never even loaded
  })

  it('does nothing for a Microsoft Store build', async () => {
    ;(process as { windowsStore?: boolean }).windowsStore = true
    const m = await load('win32')
    await m.initAutoUpdate()
    expect(m.getUpdateMode()).toEqual({ mode: 'manual', reason: 'store' })
    expect(checks()).toBe(0)
  })

  it('mac: checks at startup, follows the setting and broadcasts each state', async () => {
    h.settings = { autoInstallUpdates: false }
    const m = await load('darwin')
    expect(h.loads).toBe(0) // loaded on demand, not at import time
    await m.initAutoUpdate()
    expect(h.updater.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(h.updater.autoDownload).toBe(false)
    expect(h.updater.autoInstallOnAppQuit).toBe(true)

    h.updater.emit('checking-for-update')
    h.updater.emit('update-available', { version: '0.7.1' })
    expect(m.getUpdateState()).toEqual({ status: 'available', version: '0.7.1' })

    m.downloadNow()
    await settle()
    expect(h.updater.downloadUpdate).toHaveBeenCalled()
    h.updater.emit('download-progress', { percent: 42.5 })
    expect(m.getUpdateState()).toEqual({ status: 'downloading', version: '0.7.1', percent: 42 })

    await m.quitAndInstall()
    expect(h.updater.quitAndInstall).not.toHaveBeenCalled()

    h.updater.emit('update-downloaded', { version: '0.7.1' })
    await m.quitAndInstall()
    expect(h.updater.quitAndInstall).toHaveBeenCalledTimes(1)

    expect(h.sent.map((s) => (s as { status: string }).status)).toEqual([
      'checking',
      'available',
      'downloading', // download-started (0%)
      'downloading', // 42%
      'downloaded'
    ])

    m.applyUpdateSettings({ autoInstallUpdates: true })
    expect(h.updater.autoDownload).toBe(true)
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000)
    expect(h.updater.checkForUpdates).toHaveBeenCalledTimes(2)
  })

  it('Help > Check for Updates works before the delayed startup check, wiring events once', async () => {
    const m = await load('darwin')
    const state = await m.checkNow()
    expect(h.updater.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(state.status).toBe('idle') // the stub emits no events
    h.updater.emit('checking-for-update')
    expect(m.getUpdateState().status).toBe('checking')

    await m.initAutoUpdate() // the 5 s delayed start, arriving later
    await m.initAutoUpdate() // and never twice
    expect(h.updater.checkForUpdates).toHaveBeenCalledTimes(2)
    expect(h.updater.listenerCount('update-available')).toBe(1)
  })

  it('a failed check becomes a short error state, never a throw', async () => {
    const m = await load('darwin')
    ;(h.updater.checkForUpdates as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('net::ERR_INTERNET_DISCONNECTED\n at stack')
    )
    const state = await m.checkNow()
    expect(state.status).toBe('error')
  })

  it('Linux without APPIMAGE (.deb / tar.gz) stays on the website flow', async () => {
    const saved = process.env.APPIMAGE
    delete process.env.APPIMAGE
    const m = await load('linux')
    await m.initAutoUpdate()
    expect(m.getUpdateMode()).toEqual({ mode: 'manual', reason: 'linux-package' })
    expect(checks()).toBe(0)
    if (saved !== undefined) process.env.APPIMAGE = saved
  })
})
