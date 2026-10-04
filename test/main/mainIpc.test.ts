// @vitest-environment node
/**
 * The real ipcMain handlers and startup of src/main/index.ts, loaded with
 * Electron mocked, against a real disk. The macOS temp volume ignores case
 * like NTFS does on Windows (asserted first).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const handlers = new Map<string, (...args: unknown[]) => unknown>()
const appEvents = new Map<string, (...args: unknown[]) => unknown>()
const dialog = { showOpenDialog: vi.fn(), showMessageBox: vi.fn(), showSaveDialog: vi.fn() }
const nativeTheme = { shouldUseDarkColors: false, themeSource: 'system' as string }
const autoUpdate = {
  canInstallNow: vi.fn(() => true),
  quitAndInstall: vi.fn(async () => undefined)
}
const window = {
  isMinimized: vi.fn(() => true),
  restore: vi.fn(),
  show: vi.fn(),
  focus: vi.fn(),
  setBackgroundColor: vi.fn()
}

vi.mock('electron', () => {
  const app = {
    isPackaged: true,
    whenReady: () => new Promise(() => {}),
    on: (event: string, fn: (...a: unknown[]) => unknown) => void appEvents.set(event, fn),
    getVersion: () => '0.0.0',
    getLocale: () => 'en-US',
    getPreferredSystemLanguages: () => ['en-US'],
    getPath: () => tmpdir(),
    getAppPath: () => process.cwd(),
    commandLine: { hasSwitch: () => false },
    requestSingleInstanceLock: () => true,
    setAppUserModelId: vi.fn(),
    quit: vi.fn()
  }
  return {
    app,
    BrowserWindow: Object.assign(vi.fn(), { getFocusedWindow: () => null, getAllWindows: () => [] }),
    dialog,
    ipcMain: {
      handle: (ch: string, fn: (...a: unknown[]) => unknown) => void handlers.set(ch, fn),
      on: (ch: string, fn: (...a: unknown[]) => unknown) => void handlers.set(ch, fn)
    },
    Menu: { setApplicationMenu: vi.fn(), buildFromTemplate: vi.fn((t) => t) },
    nativeTheme,
    nativeImage: { createFromPath: vi.fn() },
    screen: { getAllDisplays: () => [] },
    shell: { openExternal: vi.fn(), showItemInFolder: vi.fn() },
    session: {
      defaultSession: { webRequest: { onBeforeRequest: vi.fn() }, setProxy: vi.fn(), setCertificateVerifyProc: vi.fn() },
      fromPartition: vi.fn()
    },
    net: { fetch: vi.fn() },
    safeStorage: { isEncryptionAvailable: () => false }
  }
})

let root = ''
beforeAll(async () => {
  // registerIpc() runs inside app.whenReady(): resolve it once so the real
  // handlers get registered (createWindow then fails on the mocked window).
  const electron = await import('electron')
  let resolved = false
  ;(electron.app as unknown as { whenReady: () => Promise<void> }).whenReady = () =>
    resolved ? new Promise(() => {}) : ((resolved = true), Promise.resolve())
  vi.doMock('../../src/main/windows', () => ({
    appWindows: () => [window],
    targetAppWindow: () => undefined
  }))
  vi.doMock('../../src/main/settings', async (orig) => ({
    ...(await orig<typeof import('../../src/main/settings')>()),
    saveSettings: (patch: Record<string, unknown>) => ({ theme: 'system', ...patch })
  }))
  vi.doMock('../../src/main/autoUpdate', async (orig) => ({
    ...(await orig<typeof import('../../src/main/autoUpdate')>()),
    ...autoUpdate
  }))
  process.on('unhandledRejection', () => {})
  await import('../../src/main/index')
  await new Promise((r) => setTimeout(r, 20))
  root = await mkdtemp(join(tmpdir(), 'tiger-ipc-'))
})
afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

/** Windows (NTFS) and macOS (APFS) disks ignore case; Linux CI runners do not. */
const caseInsensitiveDisk = (() => {
  const dir = mkdtempSync(join(tmpdir(), 'tiger-case-'))
  try {
    mkdirSync(join(dir, 'probe'))
    return existsSync(join(dir, 'PROBE'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})()

describe('renaming a folder only by case', () => {
  // The case-only rename only exists where the disk ignores case.
  it.runIf(caseInsensitiveDisk)('renames "users" to "Users" instead of failing with "Already exists"', async () => {
    await mkdir(join(root, 'users'))
    await writeFile(join(root, 'users', 'get.tiger'), 'meta {\n  name: Get\n}\nget {\n  url: x\n}\n')
    await handlers.get('tiger:moveFile')!({}, `${root}/users`, `${root}/Users`)
    expect(readdirSync(root)).toContain('Users')
    expect(readdirSync(join(root, 'Users'))).toEqual(['get.tiger'])
  })

  it('still refuses to move onto another existing folder', async () => {
    await mkdir(join(root, 'a'))
    await mkdir(join(root, 'b'))
    await expect(handlers.get('tiger:moveFile')!({}, `${root}/a`, `${root}/b`)).rejects.toThrow(/Already exists/)
  })
})

describe('Restart now with unsaved edits', () => {
  it('asks first, and never starts the installer on Keep editing', async () => {
    handlers.get('tiger:dirtyState')!({}, true)
    dialog.showMessageBox.mockResolvedValueOnce({ response: 1 })
    await handlers.get('tiger:installUpdate')!({})
    expect(dialog.showMessageBox).toHaveBeenCalledTimes(1)
    expect(autoUpdate.quitAndInstall).not.toHaveBeenCalled()

    dialog.showMessageBox.mockResolvedValueOnce({ response: 0 })
    await handlers.get('tiger:installUpdate')!({})
    expect(autoUpdate.quitAndInstall).toHaveBeenCalledTimes(1)
  })
})

describe('the native frame', () => {
  it('follows the theme chosen in Settings', async () => {
    await handlers.get('tiger:setSettings')!({}, { theme: 'dark' })
    expect(nativeTheme.themeSource).toBe('dark')
    expect(window.setBackgroundColor).toHaveBeenCalled()
  })
})

describe('a second launch', () => {
  it('brings the running window forward', () => {
    appEvents.get('second-instance')!({}, [], '')
    expect(window.restore).toHaveBeenCalled()
  })
})

describe('Save to a folder', () => {
  const files = [
    { path: 'collection.tiger', content: 'meta {\n  name: Shop\n}\n' },
    { path: 'Get.tiger', content: 'meta {\n  name: Get\n}\nget {\n  url: https://shop.test\n}\n' }
  ]
  const save = (name = 'Shop') => handlers.get('tiger:saveCollectionTo')!({}, name, files) as Promise<{ root: string } | null>

  it('writes straight into an empty folder the user picked', async () => {
    const dir = await mkdtemp(join(root, 'empty-'))
    dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [dir] })
    const opened = await save()
    expect(opened?.root.replace(/\\/g, '/')).toBe(dir.replace(/\\/g, '/'))
    expect(readdirSync(dir).sort()).toEqual(['Get.tiger', 'collection.tiger'])
  })

  it('never writes over a folder with files: it offers a subfolder named after the collection', async () => {
    const dir = await mkdtemp(join(root, 'busy-'))
    await writeFile(join(dir, 'Get.tiger'), 'mine')
    dialog.showMessageBox.mockClear()
    dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [dir] })
    dialog.showMessageBox.mockResolvedValueOnce({ response: 0 })
    const opened = await save()
    const box = dialog.showMessageBox.mock.calls[0][1]
    expect(box.buttons[0]).toBe('Create "Shop"')
    expect(opened?.root.replace(/\\/g, '/')).toBe(join(dir, 'Shop').replace(/\\/g, '/'))
    expect(readFileSync(join(dir, 'Get.tiger'), 'utf8')).toBe('mine')
    expect(readdirSync(join(dir, 'Shop')).sort()).toEqual(['Get.tiger', 'collection.tiger'])
  })

  it('lets the user choose another folder, or cancel without writing', async () => {
    const busy = await mkdtemp(join(root, 'busy-'))
    await writeFile(join(busy, 'notes.txt'), 'mine')
    const empty = await mkdtemp(join(root, 'empty-'))
    dialog.showOpenDialog
      .mockResolvedValueOnce({ canceled: false, filePaths: [busy] })
      .mockResolvedValueOnce({ canceled: false, filePaths: [empty] })
    dialog.showMessageBox.mockResolvedValueOnce({ response: 1 })
    expect((await save())?.root.replace(/\\/g, '/')).toBe(empty.replace(/\\/g, '/'))
    expect(readdirSync(busy)).toEqual(['notes.txt'])

    dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [busy] })
    dialog.showMessageBox.mockResolvedValueOnce({ response: 2 })
    expect(await save()).toBeNull()
    dialog.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    expect(await save()).toBeNull()
    expect(readdirSync(busy)).toEqual(['notes.txt'])
  })
})

describe('Restart now with an import that was never saved', () => {
  it('names the import and does not install on Keep editing', async () => {
    handlers.get('tiger:dirtyState')!({}, false)
    handlers.get('tiger:unsavedImports')!({}, ['Shop'])
    autoUpdate.quitAndInstall.mockClear()
    dialog.showMessageBox.mockClear()
    dialog.showMessageBox.mockResolvedValueOnce({ response: 1 })
    await handlers.get('tiger:installUpdate')!({})
    const options = dialog.showMessageBox.mock.calls[0].at(-1)
    expect(options.message).toBe('An imported collection is not saved')
    expect(options.detail).toContain('Shop')
    expect(autoUpdate.quitAndInstall).not.toHaveBeenCalled()
    handlers.get('tiger:unsavedImports')!({}, [])
  })
})
