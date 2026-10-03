import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../src/renderer/src/App'
import { installMatchMedia, sidebar } from './appHarness'

vi.mock('../../src/renderer/src/analytics', () => ({
  initAnalytics: vi.fn().mockResolvedValue(undefined),
  setAnalyticsEnabled: vi.fn(),
  trackEvent: vi.fn()
}))
beforeAll(installMatchMedia)
afterEach(() => {
  delete (window as { tiger?: unknown }).tiger
  localStorage.clear()
})

describe('Open collection', () => {
  it('shows the first request it selects, not "No request open"', async () => {
    const b = {
      openCollection: vi.fn().mockResolvedValue({
        root: '/col',
        name: 'col',
        requests: [{ name: 'Admin list', method: 'get', path: '/col/list.tiger', folder: [] }],
        environments: [],
        settings: {},
        folders: []
      }),
      readFile: vi.fn(async () => 'meta {\n  name: Admin list\n}\nget {\n  url: https://api.test/x\n}\n'),
      writeFile: vi.fn().mockResolvedValue(true),
      send: vi.fn(),
      getSettings: vi.fn().mockResolvedValue({ theme: 'system', timeoutMs: 30000, fontSize: 13, analyticsEnabled: false }),
      version: vi.fn().mockResolvedValue('test'),
      checkUpdate: vi.fn().mockResolvedValue(null),
      onUpdateDownloaded: vi.fn(),
      onShortcut: vi.fn(),
      historyRead: vi.fn().mockResolvedValue([]),
      track: vi.fn()
    }
    ;(window as { tiger?: unknown }).tiger = b
    render(<App />)
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'Open' }))
    await waitFor(() => expect(sidebar().textContent).toContain('Admin list'))
    expect(await screen.findByDisplayValue('https://api.test/x')).toBeInTheDocument()
  })
})
