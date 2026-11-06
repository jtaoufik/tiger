import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
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

const sidebar = () => screen.getByRole('navigation', { name: 'Collections' })

describe('sidebar New menu', () => {
  it('offers request, WebSocket, SSE, folder, collection and environment with registry names', () => {
    render(<App />)
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'New' }))
    const menu = screen.getByRole('menu', { name: 'New' })
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'New request',
      'New WebSocket request',
      'New Server-Sent Events request',
      'New folder…',
      'New collection…',
      'New environment…'
    ])
  })

  it('New folder asks for a name and adds the folder to the sidebar', () => {
    render(<App />)
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'New' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'New folder…' }))
    const input = screen.getByRole('textbox', { name: /Folder name/ })
    fireEvent.change(input, { target: { value: 'Billing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create folder' }))
    expect(within(sidebar()).getByRole('treeitem', { name: 'Billing' })).toBeInTheDocument()
  })

  it('New environment opens the manager with a fresh environment', async () => {
    render(<App />)
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'New' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'New environment…' }))
    expect(await screen.findByDisplayValue('new-environment')).toBeInTheDocument()
  })
})

describe('row menus', () => {
  it('a More actions button opens the same menu as right click', () => {
    render(<App />)
    const row = screen.getByRole('treeitem', { name: 'GET List posts' })
    fireEvent.click(within(row).getByRole('button', { name: 'More actions for List posts' }))
    const menu = screen.getByRole('menu', { name: 'Request actions' })
    expect(within(menu).getByRole('menuitem', { name: 'Copy as curl' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Delete request…' })).toBeInTheDocument()
  })

  it('Rename in the request menu starts the inline rename', () => {
    render(<App />)
    fireEvent.contextMenu(screen.getByText('Get post'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    expect(screen.getByRole('textbox', { name: 'Rename Get post' })).toHaveValue('Get post')
  })

  it('collection menu runs, exports and closes without a trash icon meaning', () => {
    render(<App />)
    fireEvent.contextMenu(screen.getByText('Demo collection'))
    const menu = screen.getByRole('menu', { name: 'Collection actions' })
    const names = within(menu).getAllByRole('menuitem').map((m) => m.textContent)
    expect(names).toEqual(
      expect.arrayContaining(['New request', 'New folder…', 'Run collection…', 'Export…', 'Close collection'])
    )
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Export…' }))
    expect(screen.getByRole('dialog', { name: 'Import and export' })).toBeInTheDocument()
  })
})

describe('keyboard and palette commands', () => {
  it('Cmd/Ctrl+B hides and shows the sidebar', () => {
    render(<App />)
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true })
    expect(screen.queryByRole('navigation', { name: 'Collections' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show sidebar' }))
    expect(sidebar()).toBeInTheDocument()
  })

  it('runs a command from the palette', () => {
    render(<App />)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Command palette' }), {
      target: { value: '>shortcuts' }
    })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
  })

  it('Load test from the palette opens that section of the open request', () => {
    render(<App />)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Command palette' }), { target: { value: '>load test' } })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(screen.getByRole('tab', { name: 'Load test' })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('request sections explain themselves', () => {
  it('Save values says what it does and links its guide', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: 'Save values' }))
    expect(
      screen.getByText('Store a value from the response into a variable for later requests')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Help: Save values/ })).toBeInTheDocument()
  })
})

describe('getting started', () => {
  it('shows three steps and ticks off the ones already done', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Tiger home' }))
    const steps = screen.getByRole('region', { name: 'Getting started' })
    const list = within(steps).getAllByRole('listitem')
    expect(list).toHaveLength(3)
    // The demo collection is open and a request is showing; nothing sent yet.
    expect(list[0]).toHaveTextContent('(done)')
    expect(list[2]).not.toHaveTextContent('(done)')
  })
})
