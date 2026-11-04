/**
 * Stability fixes in App: a failed save is reported, a stored root that does
 * not open stays in the persisted session, the native menu listener is
 * removed on unmount, and closing a collection with unsaved edits says so.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../src/renderer/src/App'
import { installMatchMedia, SEP, sidebar } from './appHarness'

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
const storedMisses = () => JSON.parse(localStorage.getItem('tiger.session.rootMisses') ?? 'null')
const seedMisses = (misses: Record<string, number>) =>
  localStorage.setItem('tiger.session.rootMisses', JSON.stringify(misses))

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
    const note = await screen.findByText(/Could not reopen \/gone/)
    expect(note).toHaveTextContent('Tiger will try again on the next 2 launches, then forget it.')
    // Informational, not an error: there is nothing to fix right now.
    expect(note.closest('.toast')).not.toHaveClass('error')
    await waitFor(() => expect(storedRoots()).toEqual([ROOT, '/gone']))
    expect(storedMisses()).toEqual({ '/gone': 1 })
  })

  it('still keeps the root after the second miss, saying one attempt is left', async () => {
    storeSession([ROOT, '/gone'])
    seedMisses({ '/gone': 1 })
    ;(window as { tiger?: unknown }).tiger = bridge()
    render(<App />)
    expect(await screen.findByDisplayValue('Alpha')).toBeInTheDocument()
    expect(await screen.findByText(/Could not reopen \/gone/)).toHaveTextContent(
      'Tiger will try once more next launch, then forget it.'
    )
    await waitFor(() => expect(storedRoots()).toEqual([ROOT, '/gone']))
    expect(storedMisses()).toEqual({ '/gone': 2 })
  })

  it('forgets the root on the third miss in a row and says so', async () => {
    storeSession([ROOT, '/gone'])
    seedMisses({ '/gone': 2 })
    ;(window as { tiger?: unknown }).tiger = bridge()
    render(<App />)
    expect(await screen.findByDisplayValue('Alpha')).toBeInTheDocument()
    expect(
      await screen.findByText('Forgot /gone: its folder was missing at the last 3 launches in a row.')
    ).toBeInTheDocument()
    expect(screen.queryByText(/Could not reopen/)).toBeNull()
    await waitFor(() => expect(storedRoots()).toEqual([ROOT]))
    expect(storedMisses()).toEqual({})
  })

  it('a root that opens again starts its count over', async () => {
    storeSession([ROOT, '/gone'])
    seedMisses({ [ROOT]: 2, '/gone': 1 })
    ;(window as { tiger?: unknown }).tiger = bridge()
    render(<App />)
    expect(await screen.findByDisplayValue('Alpha')).toBeInTheDocument()
    await waitFor(() => expect(storedRoots()).toEqual([ROOT, '/gone']))
    expect(storedMisses()).toEqual({ '/gone': 2 })
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

describe('a sync that finishes while a request is being edited', () => {
  it('keeps the edit instead of reloading the request from disk', async () => {
    storeSession([ROOT])
    let finishSync: (result: unknown) => void = () => {}
    const status = { isRepo: true, branch: 'main', dirtyCount: 0, changedFiles: [], ahead: 0, behind: 1, hasUpstream: true, hasRemote: true }
    const git = {
      check: vi.fn().mockResolvedValue({ ok: true, version: '2.45' }),
      status: vi.fn().mockResolvedValue(status),
      log: vi.fn().mockResolvedValue([]),
      requestNames: vi.fn().mockResolvedValue({}),
      // The sync takes as long as the test wants: it resolves on finishSync.
      sync: vi.fn(() => new Promise((resolve) => (finishSync = resolve))),
      onProgress: vi.fn(() => () => {})
    }
    ;(window as { tiger?: unknown }).tiger = bridge({ git })
    render(<App />)
    expect(await screen.findByDisplayValue('https://api.test/a')).toBeInTheDocument()
    fireEvent.click(within(sidebar()).getByText('col'))
    fireEvent.click(await screen.findByRole('button', { name: 'Sync with team' }))
    expect(git.sync).toHaveBeenCalledTimes(1)
    // Back to the request: this edit happens while the sync runs.
    fireEvent.click(within(sidebar()).getByText('Alpha'))
    const url = await screen.findByDisplayValue('https://api.test/a')
    fireEvent.change(url, { target: { value: 'https://api.test/changed' } })
    await act(async () => {
      finishSync({ ok: true, message: 'Synced', received: 1, sent: 0 })
    })
    expect(await screen.findByText(/Kept one request with unsaved edits/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('https://api.test/changed')).toBeInTheDocument()
    expect(document.querySelector('.request-tab-dirty')).not.toBeNull()
  })
})
