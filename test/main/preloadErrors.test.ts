// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

const exposed: Record<string, unknown> = {}
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: (_name: string, api: unknown) => Object.assign(exposed, { api }) },
  ipcRenderer: {
    invoke: vi.fn(async (channel: string) => {
      throw new Error(`Error invoking remote method '${channel}': Error: getaddrinfo ENOTFOUND api.test`)
    }),
    on: vi.fn(),
    send: vi.fn(),
    removeListener: vi.fn()
  },
  webUtils: { getPathForFile: () => '' }
}))

describe('errors from the main process', () => {
  it('reach the window without Electron’s "Error invoking remote method" wrapper', async () => {
    await import('../../src/preload/index')
    const api = exposed.api as { send: (b: unknown, t: number) => Promise<unknown> }
    await expect(api.send({ method: 'GET', url: 'https://api.test', headers: {} }, 1000)).rejects.toThrow(
      /^getaddrinfo ENOTFOUND api\.test$/
    )
  })
})
