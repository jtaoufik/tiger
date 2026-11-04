// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

type Listener = (e: unknown, ...args: unknown[]) => void
const exposed: Record<string, unknown> = {}
const ipc = {
  on: vi.fn<(channel: string, listener: Listener) => void>(),
  removeListener: vi.fn<(channel: string, listener: Listener) => void>()
}
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: (_name: string, api: unknown) => Object.assign(exposed, { api }) },
  ipcRenderer: { invoke: vi.fn(), send: vi.fn(), on: ipc.on, removeListener: ipc.removeListener },
  webUtils: { getPathForFile: () => '' }
}))

interface Api {
  onShortcut: (cb: (name: string) => void) => () => void
  onFullscreen: (cb: (state: boolean) => void) => () => void
}

describe('push listeners in the preload', () => {
  it('onShortcut delivers names and returns an unsubscribe that removes the same listener', async () => {
    await import('../../src/preload/index')
    const api = exposed.api as Api
    const cb = vi.fn()
    const off = api.onShortcut(cb)
    const [channel, listener] = ipc.on.mock.calls.find((c) => c[0] === 'tiger:shortcut')!
    expect(channel).toBe('tiger:shortcut')
    listener({}, 'save')
    expect(cb).toHaveBeenCalledWith('save')
    off()
    expect(ipc.removeListener).toHaveBeenCalledWith('tiger:shortcut', listener)
  })

  it('onFullscreen does the same', async () => {
    await import('../../src/preload/index')
    const api = exposed.api as Api
    const cb = vi.fn()
    const off = api.onFullscreen(cb)
    const [, listener] = ipc.on.mock.calls.find((c) => c[0] === 'tiger:fullscreen')!
    listener({}, true)
    expect(cb).toHaveBeenCalledWith(true)
    off()
    expect(ipc.removeListener).toHaveBeenCalledWith('tiger:fullscreen', listener)
  })
})
