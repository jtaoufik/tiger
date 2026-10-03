import { beforeEach, describe, expect, it, vi } from 'vitest'

const settings = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
const setProxy = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('electron', () => ({
  net: {},
  session: { defaultSession: { setProxy, setCertificateVerifyProc: () => undefined } }
}))
vi.mock('../../src/main/settings', () => ({ loadSettings: () => settings.value }))
vi.mock('../../src/main/cookieJar', () => ({}))

import { applyNetworkSettings } from '../../src/main/http'

const base = { proxyEnabled: false, proxyUrl: '', sslVerify: true, certExceptions: '' }

describe('proxy setting', () => {
  beforeEach(() => setProxy.mockClear())

  it('follows the system proxy (Windows or macOS settings, PAC, WPAD) when Tiger has none of its own', () => {
    settings.value = { ...base }
    applyNetworkSettings()
    expect(setProxy).toHaveBeenCalledWith({ mode: 'system' })
    expect(setProxy).not.toHaveBeenCalledWith({ mode: 'direct' })
  })

  it('a proxy URL left in place while the switch is off is not used', () => {
    settings.value = { ...base, proxyUrl: 'http://proxy.corp:8080' }
    applyNetworkSettings()
    expect(setProxy).toHaveBeenCalledWith({ mode: 'system' })
  })

  it("uses Tiger's own proxy when it is switched on", () => {
    settings.value = { ...base, proxyEnabled: true, proxyUrl: 'http://proxy.corp:8080' }
    applyNetworkSettings()
    expect(setProxy).toHaveBeenCalledWith({ mode: 'fixed_servers', proxyRules: 'http://proxy.corp:8080' })
  })
})
