import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../src/renderer/src/App'
import type { ImportedRequest, ImportResult } from '../../src/core/import/types'
import { bridge, collection, importVia, installMatchMedia, SEP, sidebar } from './appHarness'

// The real analytics module pulls in Firebase.
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

describe('what an import shows', () => {
  it('shows the imported request, not the collection page that was open', async () => {
    ;(window as { tiger?: unknown }).tiger = bridge([collection('Alpha', 'Get alpha', 'https://alpha.test')])
    render(<App />)
    fireEvent.click(within(sidebar()).getByText('Demo collection'))
    expect(screen.queryByRole('textbox', { name: 'Request name' })).not.toBeInTheDocument()

    await importVia('Postman')
    expect(screen.getByRole('textbox', { name: 'Request name' })).toHaveValue('Get alpha')
  })

  it('opens the imported request on its first section, even after a load test elsewhere', async () => {
    ;(window as { tiger?: unknown }).tiger = bridge([collection('Alpha', 'Get alpha', 'https://alpha.test')])
    render(<App />)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'Command palette' }), { target: { value: '>load test' } })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(screen.getByRole('tab', { name: 'Load test' })).toHaveAttribute('aria-selected', 'true')

    await importVia('Postman')
    expect(screen.getByRole('textbox', { name: 'Request name' })).toHaveValue('Get alpha')
    expect(screen.getByRole('tab', { name: 'Load test' })).toHaveAttribute('aria-selected', 'false')
  })

  it('gives a fresh import its own history, not the sends of an import from an earlier launch', async () => {
    const earlier = {
      id: 'h1',
      requestId: `import-1${SEP}0`,
      method: 'GET',
      url: 'https://earlier.test/old-send',
      status: 200,
      timeMs: 5,
      at: Date.now() - 86_400_000
    }
    ;(window as { tiger?: unknown }).tiger = bridge([collection('Alpha', 'Get alpha', 'https://alpha.test')], [earlier])
    render(<App />)
    await importVia('Postman')
    fireEvent.click(screen.getByTitle('History'))
    await waitFor(() => expect(screen.getByRole('dialog', { name: /History/ })).toBeInTheDocument())
    expect(screen.queryByText(/earlier\.test/)).not.toBeInTheDocument()
  })
})

describe('a folder that only holds subfolders (common in nested imports)', () => {
  const get = (name: string, path: string[]): ImportedRequest => ({
    path,
    request: {
      name,
      method: 'get',
      url: `https://nested.test/${name.toLowerCase().replace(/\s+/g, '-')}`,
      headers: [],
      query: [],
      body: { type: 'none', content: '' }
    }
  })
  const nested: ImportResult = {
    name: 'Nested',
    source: 'postman',
    requests: [get('Get admin', ['Users', 'Admin']), get('List guests', ['Users', 'Guests'])]
  }

  async function openUsersFolder() {
    ;(window as { tiger?: unknown }).tiger = bridge([nested])
    render(<App />)
    await importVia('Postman')
    fireEvent.click(within(screen.getByRole('treeitem', { name: 'Nested' })).getByText('Users'))
  }

  it('lists the requests of its subfolders on the folder page', async () => {
    await openUsersFolder()
    expect(await screen.findByText('2 requests in this folder')).toBeInTheDocument()
    const list = document.querySelector('.cv-req-list') as HTMLElement
    expect(within(list).getByRole('button', { name: /Admin \/ Get admin/ })).toBeInTheDocument()
    expect(screen.queryByText('Create the first request')).not.toBeInTheDocument()
  })

  it('runs the requests of its subfolders', async () => {
    await openUsersFolder()
    fireEvent.click(await screen.findByRole('button', { name: 'Run folder' }))
    expect(await screen.findByRole('button', { name: 'Run 2 requests' })).toBeInTheDocument()
  })
})
