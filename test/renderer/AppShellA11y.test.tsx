import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../src/renderer/src/App'

vi.mock('../../src/renderer/src/analytics', () => ({
  initAnalytics: vi.fn().mockResolvedValue(undefined),
  setAnalyticsEnabled: vi.fn(),
  trackEvent: vi.fn()
}))

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false
  })) as unknown as typeof window.matchMedia
})

beforeEach(() => {
  document.body.innerHTML = ''
  window.localStorage.clear()
  delete (window as { tiger?: unknown }).tiger
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App shell accessibility', () => {
  it('has banner, navigation and main landmarks and an h1', () => {
    render(<App />)
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Collections' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
    expect(screen.getByRole('heading', { level: 1, name: 'Tiger' })).toBeInTheDocument()
  })

  it('the skip link is the first focusable element and jumps to the URL field', () => {
    render(<App />)
    const skip = screen.getByRole('link', { name: 'Skip to request URL' })
    const focusables = document.querySelectorAll<HTMLElement>('a[href], button, input, select, [tabindex="0"]')
    expect(focusables[0]).toBe(skip)
    fireEvent.click(skip)
    expect(document.activeElement).toHaveClass('url-input')
  })

  it('titles the window after the active request', () => {
    render(<App />)
    const active = document.querySelector('.request-tab.active .request-tab-name')!.textContent
    expect(document.title).toBe(`${active} - Tiger`)
    fireEvent.click(screen.getByTitle('Settings'))
    expect(document.title).toBe('Settings - Tiger')
    expect(screen.getByTitle('Settings')).toHaveAttribute('aria-current', 'page')
  })

  it('names the icon-only titlebar controls and the environment picker', () => {
    render(<App />)
    const banner = within(screen.getByRole('banner'))
    expect(banner.getByRole('combobox', { name: 'Active environment' })).toBeInTheDocument()
    expect(banner.getByRole('button', { name: 'Manage environments' })).toBeInTheDocument()
    expect(banner.getByRole('button', { name: 'Tiger home' })).toBeInTheDocument()
  })

  it('announces the response status and time after a send', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"ok":true}', {
          status: 201,
          statusText: 'Created',
          headers: { 'content-type': 'application/json' }
        })
      )
    )
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /^Send/ }))
    await waitFor(() =>
      expect(document.getElementById('tiger-live-polite')?.textContent).toMatch(
        /^Response 201 Created in \d+ ms/
      )
    )
  })

  it('announces a failed send assertively', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network down')))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /^Send/ }))
    await waitFor(() =>
      expect(document.getElementById('tiger-live-assertive')?.textContent).toMatch(/^Request failed: /)
    )
  })

  it('toasts live in a persistent polite region', async () => {
    render(<App />)
    const region = document.querySelector('.toasts')!
    expect(region).toHaveAttribute('aria-live', 'polite')
    fireEvent.click(screen.getAllByRole('button', { name: 'Duplicate request' })[0])
    expect(await within(region as HTMLElement).findByText('Request duplicated')).toBeInTheDocument()
  })

  it('the sidebar splitter resizes from the keyboard and persists', () => {
    render(<App />)
    const sep = screen.getByRole('separator', { name: 'Resize sidebar' })
    expect(sep).toHaveAttribute('aria-valuenow', '264')
    sep.focus()
    fireEvent.keyDown(sep, { key: 'ArrowRight' })
    expect(sep).toHaveAttribute('aria-valuenow', '280')
    expect(window.localStorage.getItem('tiger.sidebarW')).toBe('280')
  })

  it('the workspace below the tabs is the active tab panel', () => {
    render(<App />)
    const panel = document.getElementById('workspace-panel')!
    expect(panel).toHaveAttribute('role', 'tabpanel')
    const activeTab = screen.getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')!
    expect(activeTab).toHaveAttribute('aria-controls', 'workspace-panel')
  })

  it('opens a folder context menu from the keyboard and returns focus on Escape', () => {
    render(<App />)
    const folder = screen.getByRole('treeitem', { name: 'Posts' })
    folder.focus()
    fireEvent.keyDown(folder, { key: 'F10', shiftKey: true })
    const menu = screen.getByRole('menu', { name: 'Folder actions' })
    expect(within(menu).getByRole('menuitem', { name: 'New request here' })).toBeInTheDocument()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(folder).toHaveFocus()
  })
})
