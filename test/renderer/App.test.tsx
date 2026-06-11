import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import App from '../../src/renderer/src/App'

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
})

describe('App (browser preview, no Electron bridge)', () => {
  it('renders the demo collection with folders in the sidebar', () => {
    render(<App />)
    expect(screen.getByText('Demo collection')).toBeInTheDocument()
    expect(screen.getByText('Posts')).toBeInTheDocument()
    expect(screen.getByText('Users')).toBeInTheDocument()
    expect(screen.getByText('List posts')).toBeInTheDocument()
  })

  it('folds and unfolds a folder via its chevron', () => {
    render(<App />)
    const row = screen.getByText('Posts').closest('.folder-row')!
    fireEvent.click(within(row as HTMLElement).getByTitle('Collapse folder'))
    expect(screen.queryByText('List posts')).not.toBeInTheDocument()
    expect(screen.getByText('List users')).toBeInTheDocument()
    fireEvent.click(within(row as HTMLElement).getByTitle('Expand folder'))
    expect(screen.getByText('List posts')).toBeInTheDocument()
  })

  it('folds a whole collection via its chevron', () => {
    render(<App />)
    const head = screen.getByText('Demo collection').closest('.col-head')!
    fireEvent.click(within(head as HTMLElement).getByTitle('Collapse collection'))
    expect(screen.queryByText('Posts')).not.toBeInTheDocument()
    expect(screen.queryByText('List posts')).not.toBeInTheDocument()
  })

  it('opens the collection view with sync, auth and activity on click', async () => {
    render(<App />)
    fireEvent.click(screen.getByText('Demo collection'))
    expect(await screen.findByText('Team sync')).toBeInTheDocument()
    expect(screen.getByText(/Default auth/)).toBeInTheDocument()
    expect(screen.getByText(/Recent activity/)).toBeInTheDocument()
    expect(screen.getByText(/lives in memory/)).toBeInTheDocument()
  })

  it('opens a folder view listing its requests', () => {
    render(<App />)
    fireEvent.click(screen.getByText('Posts'))
    expect(screen.getByText('New request here')).toBeInTheDocument()
    const label = [...document.querySelectorAll('.section-label')].find(
      (el) => el.textContent?.replace(/\s+/g, ' ').trim() === '3 requests in this folder'
    )
    expect(label).toBeTruthy()
  })

  it('filters requests with the search box', () => {
    render(<App />)
    fireEvent.change(screen.getByPlaceholderText('Search requests'), {
      target: { value: 'create' }
    })
    expect(screen.getByText('Create post')).toBeInTheDocument()
    expect(screen.queryByText('List posts')).not.toBeInTheDocument()
    expect(screen.queryByText('Posts')).not.toBeInTheDocument()
  })

  it('creates a new request in a collection', () => {
    render(<App />)
    fireEvent.click(screen.getByTitle('New request'))
    expect(screen.getByDisplayValue('New request')).toBeInTheDocument()
  })

  it('deletes a request through the in-app confirm modal', async () => {
    render(<App />)
    const row = screen.getByText('List posts').closest('.tree-row')!
    fireEvent.click(within(row as HTMLElement).getByTitle('Delete request'))
    expect(screen.getByText(/Delete "List posts"/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Request deleted')).toBeInTheDocument()
    expect(screen.queryByText('List posts')).not.toBeInTheDocument()
  })

  it('keeps the request when deletion is cancelled', () => {
    render(<App />)
    const row = screen.getByText('Get post').closest('.tree-row')!
    fireEvent.click(within(row as HTMLElement).getByTitle('Delete request'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Get post')).toBeInTheDocument()
  })

  it('closes a collection after confirming', () => {
    render(<App />)
    const head = screen.getByText('Demo collection').closest('.col-head')!
    fireEvent.click(within(head as HTMLElement).getByTitle('Close collection'))
    expect(screen.getByText(/Close "Demo collection"/)).toBeInTheDocument()
    fireEvent.click(document.querySelector('.modal .btn.danger')!)
    expect(screen.queryByText('Demo collection')).not.toBeInTheDocument()
    expect(screen.getByText('No collections open.')).toBeInTheDocument()
  })

  it('shows the request editor with Params, Headers, Auth and Body tabs', () => {
    render(<App />)
    const editor = document.querySelector('.editor')!
    const tabs = within(editor as HTMLElement)
    expect(tabs.getByText(/Params/)).toBeInTheDocument()
    expect(tabs.getByText(/Headers/)).toBeInTheDocument()
    expect(tabs.getByText(/Auth/)).toBeInTheDocument()
    expect(tabs.getByText(/Body/)).toBeInTheDocument()
  })

  it('offers all auth types in the Auth tab', () => {
    render(<App />)
    fireEvent.click(screen.getByText(/^Auth/))
    const select = document.querySelector('.tab-body select')!
    const labels = [...select.querySelectorAll('option')].map((o) => o.textContent)
    expect(labels).toEqual([
      'Inherit from collection',
      'No Auth',
      'Bearer Token',
      'Basic Auth',
      'API Key',
      'OAuth 2.0 — Client Credentials'
    ])
  })

  it('opens the Import/Export modal with all sources and targets', () => {
    render(<App />)
    fireEvent.click(screen.getByTitle('Import / Export'))
    expect(screen.getByText('Postman')).toBeInTheDocument()
    expect(screen.getByText('Bruno')).toBeInTheDocument()
    expect(screen.getByText('OpenAPI / Swagger')).toBeInTheDocument()
    expect(screen.getByText('Insomnia')).toBeInTheDocument()
    expect(screen.getByText('Postman collection')).toBeInTheDocument()
    expect(screen.getByText('Active environment')).toBeInTheDocument()
    expect(screen.getByText('Request as .tiger')).toBeInTheDocument()
    expect(screen.getByText('Request as cURL')).toBeInTheDocument()
  })

  it('copies a curl command from the export screen and confirms with a toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<App />)
    fireEvent.click(screen.getByTitle('Import / Export'))
    fireEvent.click(screen.getByText('Request as cURL'))
    expect(await screen.findByText('curl command copied')).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('curl -X GET'))
  })

  it('closes a modal with Escape', () => {
    render(<App />)
    fireEvent.click(screen.getByTitle('Import / Export'))
    expect(screen.getByText('Postman')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText('Postman')).not.toBeInTheDocument()
  })

  it('shows network + privacy settings with analytics on by default', () => {
    render(<App />)
    fireEvent.click(screen.getByTitle('Settings'))
    fireEvent.click(screen.getByRole('button', { name: 'Network' }))
    expect(screen.getByText('Follow redirects')).toBeInTheDocument()
    expect(screen.getByText('Verify SSL certificates')).toBeInTheDocument()
    expect(screen.getByText('Use a proxy')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Privacy' }))
    const analyticsRow = screen.getByText('Anonymous usage analytics').closest('.setting-row')!
    expect(analyticsRow.querySelector('.switch.on')).not.toBeNull()
  })

  it('switches theme via the appearance segmented control', () => {
    render(<App />)
    fireEvent.click(screen.getByTitle('Settings'))
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    fireEvent.click(screen.getByRole('button', { name: 'Light' }))
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('opens the environments manager with the demo variables and secret toggle', () => {
    render(<App />)
    fireEvent.click(screen.getByTitle('Manage environments'))
    expect(screen.getByText('Environments')).toBeInTheDocument()
    expect(screen.getByDisplayValue('baseUrl')).toBeInTheDocument()
    expect(screen.getByText('New environment')).toBeInTheDocument()
    expect(screen.getAllByTitle('Mark as secret').length).toBeGreaterThan(0)
  })

  it('runs a performance run modal for the active request', () => {
    render(<App />)
    fireEvent.click(screen.getByTitle('Performance run'))
    expect(screen.getByText('Performance run')).toBeInTheDocument()
    expect(screen.getByText('Total requests')).toBeInTheDocument()
    expect(screen.getByText('Concurrency')).toBeInTheDocument()
  })

  it('offers create actions including clone on empty-space right click', () => {
    render(<App />)
    fireEvent.contextMenu(document.querySelector('.tree')!)
    expect(screen.getByText('Open collection folder…')).toBeInTheDocument()
    expect(screen.getByText('Clone from Git…')).toBeInTheDocument()
    expect(screen.getByText('Manage environments…')).toBeInTheDocument()
  })

  it('exposes a Clone from Git action in the sidebar header', () => {
    render(<App />)
    expect(screen.getByTitle('Clone from Git')).toBeInTheDocument()
  })

  it('opens an in-app clone prompt (not a blocked native prompt)', () => {
    render(<App />)
    fireEvent.click(screen.getByTitle('Clone from Git'))
    expect(screen.getByText('Repository URL')).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('https://github.com/your-team/payments-api.git')
    ).toBeInTheDocument()
  })

  it('opens the code generation modal with a curl command for the active request', () => {
    render(<App />)
    fireEvent.click(screen.getByTitle('Generate code'))
    const code = document.querySelector('.code-block')!
    expect(code.textContent).toContain('curl -X GET')
    expect(code.textContent).toContain('https://jsonplaceholder.typicode.com/posts')
  })

  it('renames the active request from the editor and syncs the sidebar', () => {
    render(<App />)
    fireEvent.change(screen.getByDisplayValue('List posts'), { target: { value: 'All posts' } })
    const sidebar = document.querySelector('.sidebar')!
    expect(within(sidebar as HTMLElement).getByText('All posts')).toBeInTheDocument()
  })

  it('opens the command palette with cmd+k and jumps to a request', () => {
    render(<App />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const input = screen.getByPlaceholderText('Go to request…')
    fireEvent.change(input, { target: { value: 'users' } })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(screen.queryByPlaceholderText('Go to request…')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('List users')).toBeInTheDocument()
  })

  it('duplicates a request from the sidebar', async () => {
    render(<App />)
    const row = screen.getByText('Get post').closest('.tree-row')!
    fireEvent.click(within(row as HTMLElement).getByTitle('Duplicate request'))
    expect(await screen.findByText('Get post copy')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Get post copy')).toBeInTheDocument()
  })

  it('warns about unresolved variables in the active request', () => {
    render(<App />)
    const url = document.querySelector('.url-input') as HTMLInputElement
    fireEvent.change(url, { target: { value: '{{nope}}/x' } })
    expect(screen.getByText(/Unresolved variables/)).toBeInTheDocument()
    expect(screen.getByText(/\{\{nope\}\}/)).toBeInTheDocument()
  })

  it('formats a JSON body and flags invalid JSON', () => {
    render(<App />)
    fireEvent.click(screen.getByText(/^Body/))
    fireEvent.click(screen.getByRole('button', { name: 'json' }))
    const area = document.querySelector('.code-area') as HTMLTextAreaElement
    fireEvent.change(area, { target: { value: '{"a":1' } })
    expect(screen.getByText('Invalid JSON')).toBeInTheDocument()
    fireEvent.change(area, { target: { value: '{"a":1}' } })
    fireEvent.click(screen.getByText('Format'))
    expect((document.querySelector('.code-area') as HTMLTextAreaElement).value).toBe(
      '{\n  "a": 1\n}'
    )
  })
})
