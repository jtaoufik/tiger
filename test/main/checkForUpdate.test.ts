import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// http.ts imports `electron` and `./settings` (also electron). Stub both so
// checkForUpdate can be imported and exercised without Electron. Mirrors the
// pattern in httpRedirect.test.ts.
const fetchMock = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({
  net: { fetch: fetchMock },
  session: { defaultSession: {} }
}))
vi.mock('../../src/main/settings', () => ({
  loadSettings: () => ({ cookieJarEnabled: false })
}))
vi.mock('../../src/main/cookieJar', () => ({
  cookieHeaderFor: () => '',
  storeCookies: () => undefined
}))

import { checkForUpdate } from '../../src/main/http'

describe('checkForUpdate', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ version: '9.9.9', url: 'https://example.com', notes: [] })
    })
  })

  afterEach(() => {
    delete (process as { windowsStore?: boolean }).windowsStore
  })

  it('reports a newer version when one is published', async () => {
    const info = await checkForUpdate('1.0.0')
    expect(info?.latest).toBe('9.9.9')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('never checks (or reports an update) in a Microsoft Store build', async () => {
    ;(process as { windowsStore?: boolean }).windowsStore = true
    const info = await checkForUpdate('1.0.0')
    expect(info).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
