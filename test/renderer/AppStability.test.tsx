/**
 * Stability fixes in App: a failed save is reported, a stored root that does
 * not open stays in the persisted session, the native menu listener is
 * removed on unmount, and closing a collection with unsaved edits says so.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../src/renderer/src/App'
import { installMatchMedia, SEP } from './appHarness'

vi.mock('../../src/renderer/src/analytics', () => ({
  initAnalytics: vi.fn().mockResolvedValue(undefined),
  setAnalyticsEnabled: vi.fn(),
  trackEvent: vi.fn()
}))
beforeAll(installMatchMedia)
afterEach(() => {
  delete (window as { tiger?: unknown }).tiger
  localStorage.clear()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const ROOT = '/col'
const aId = `${ROOT}${SEP}${ROOT}/alpha.tiger`
const payload = {
  root: ROOT,
  name: 'col',
  requests: [{ name: 'Alpha', method: 'get', path: `${ROOT}/alpha.tiger`, folder: [] }],
  environments: [],
  settings: {},
  folders: []
}
const requestText = 'meta {\n  name: Alpha\n}\nget {\n  url: https://api.test/a\n}'

function bridge(overrides: Record<string, unknown> = {}) {
  return {
    openPath: vi.fn(async (root: string) => (root === ROOT ? payload : null)),
    readFile: vi.fn().mockResolvedValue(requestText),
    writeFile: vi.fn().mockResolvedValue(true),
    getSettings: vi.fn().mockResolvedValue({ theme: 'system', timeoutMs: 30000, fontSize: 13, analyticsEnabled: false }),
    version: vi.fn().mockResolvedValue('test'),
    checkUpdate: vi.fn().mockResolvedValue(null),
    onShortcut: vi.fn(),
    historyRead: vi.fn().mockResolvedValue([]),
    track: vi.fn(),
    ...overrides
  }
}

function storeSession(roots: string[]): void {
  localStorage.setItem('tiger.session.roots', JSON.stringify(roots))
  localStorage.setItem('tiger.session.tabs', JSON.stringify([{ kind: 'request', id: aId }]))
  localStorage.setItem('tiger.session.active', `r:${aId}`)
}

const storedRoots = () => JSON.parse(localStorage.getItem('tiger.session.roots') ?? 'null')

describe('save failures', () => {
  it('shows an error toast and keeps the request dirty when the write fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    storeSession([ROOT])
    ;(window as { tiger?: unknown }).tiger = bridge({
      writeFile: vi.fn().mockRejectedValue(new Error('EACCES: permission denied'))
    })
    render(<App />)
    const url = await screen.findByDisplayValue('https://api.test/a')
    fireEvent.change(url, { target: { value: 'https://api.test/changed' } })
    expect(document.querySelector('.request-tab-dirty')).not.toBeNull()
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    expect(await screen.findByText('Could not save: EACCES: permission denied')).toBeInTheDocument()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    expect(document.querySelector('.request-tab-dirty')).not.toBeNull()
  })
})

describe('session restore with an unavailable root', () => {
  it('keeps a root that failed to open in the persisted session and says so', async () => {
    storeSession([ROOT, '/gone'])
    ;(window as { tiger?: unknown }).tiger = bridge()
    render(<App />)
    expect(await screen.findByDisplayValue('Alpha')).toBeInTheDocument()
    expect(await screen.findByText(/Could not reopen \/gone/)).toBeInTheDocument()
    await waitFor(() => expect(storedRoots()).toEqual([ROOT, '/gone']))
  })

  it('does not overwrite the stored roots with [] when every root is unavailable', async () => {
    localStorage.setItem('tiger.session.roots', JSON.stringify(['/gone']))
    ;(window as { tiger?: unknown }).tiger = bridge()
    render(<App />)
    expect(await screen.findByText('Demo collection')).toBeInTheDocument()
    await waitFor(() => expect(storedRoots()).toEqual(['/gone']))
  })
})

describe('native menu listener', () => {
  it('unsubscribes from onShortcut when App unmounts', () => {
    const off = vi.fn()
    ;(window as { tiger?: unknown }).tiger = bridge({ onShortcut: vi.fn(() => off) })
    const { unmount } = render(<App />)
    expect(off).not.toHaveBeenCalled()
    unmount()
    expect(off).toHaveBeenCalledTimes(1)
  })
})

describe('closing a collection with unsaved edits', () => {
  it('warns about the edits instead of promising that files stay on disk', async () => {
    storeSession([ROOT])
    ;(window as { tiger?: unknown }).tiger = bridge()
    render(<App />)
    const url = await screen.findByDisplayValue('https://api.test/a')
    fireEvent.change(url, { target: { value: 'https://api.test/changed' } })
    const head = screen.getByText('col').closest('.col-head')!
    fireEvent.click(within(head as HTMLElement).getByTitle('Close collection'))
    expect(screen.getByText(/One request has unsaved edits that will be lost/)).toBeInTheDocument()
  })
})
