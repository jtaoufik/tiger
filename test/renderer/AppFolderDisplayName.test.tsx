import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../src/renderer/src/App'
import { fakeDisk, installMatchMedia, sidebar } from './appHarness'

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

const REQUEST = 'meta {\n  name: List\n  seq: 1\n}\nget {\n  url: https://api.test/products\n}\n'

/** A collection on disk whose folder "Store- front-" keeps its shown name in folder.tiger. */
function openWith(files: Map<string, string>) {
  const b = {
    openCollection: vi.fn().mockResolvedValue({
      root: '/col',
      name: 'col',
      requests: [{ name: 'List', method: 'get', seq: 1, path: '/col/Store- front-/list.tiger', folder: ['Store- front-'] }],
      environments: [],
      settings: {},
      folders: [{ folder: ['Store- front-'], name: 'Store: front?', seq: 1 }]
    }),
    readFile: vi.fn(async (path: string) => {
      const text = files.get(path)
      if (text === undefined) throw new Error(`ENOENT: ${path}`)
      return text
    }),
    writeFile: vi.fn(async (path: string, content: string) => {
      files.set(path, content)
      return true
    }),
    moveFile: vi.fn(async (from: string, to: string) => {
      for (const [k, v] of [...files]) {
        if (k === from || k.startsWith(`${from}/`)) {
          files.delete(k)
          files.set(to + k.slice(from.length), v)
        }
      }
      return true
    }),
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
  return b
}

const folderRow = (name: string) => within(sidebar()).getByRole('treeitem', { name })

async function renameFolder(from: string, to: string) {
  fireEvent.doubleClick(within(folderRow(from)).getByText(from))
  const input = screen.getByRole('textbox', { name: `Rename folder ${from}` })
  // The draft starts from the shown name, not the disk name.
  expect(input).toHaveValue(from)
  fireEvent.change(input, { target: { value: to } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

describe('a folder shown under the name its folder.tiger keeps', () => {
  it('shows "Store: front?" in the sidebar for the disk folder "Store- front-", and finds it by search', async () => {
    const files = new Map([
      ['/col/Store- front-/list.tiger', REQUEST],
      ['/col/Store- front-/folder.tiger', 'meta {\n  name: Store: front?\n  seq: 1\n}\n']
    ])
    openWith(files)
    await waitFor(() => expect(folderRow('Store: front?')).toBeInTheDocument())
    expect(sidebar().textContent).not.toContain('Store- front-')

    const search = screen.getByRole('searchbox', { name: 'Search requests' })
    fireEvent.change(search, { target: { value: 'front?' } })
    expect(within(sidebar()).getByRole('treeitem', { name: 'GET List' })).toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'front-' } })
    expect(within(sidebar()).getByRole('treeitem', { name: 'GET List' })).toBeInTheDocument()
  })

  it('renaming updates the label and the file: a safe name drops name:, an unsafe one keeps the typed name', async () => {
    const files = new Map([
      ['/col/Store- front-/list.tiger', REQUEST],
      ['/col/Store- front-/folder.tiger', 'meta {\n  name: Store: front?\n  seq: 1\n}\n']
    ])
    const b = openWith(files)
    await waitFor(() => expect(folderRow('Store: front?')).toBeInTheDocument())

    await renameFolder('Store: front?', 'Store front')
    await waitFor(() => expect(folderRow('Store front')).toBeInTheDocument())
    expect(b.moveFile).toHaveBeenCalledWith('/col/Store- front-', '/col/Store front')
    // The old shown name is gone from folder.tiger; the position stays.
    expect(files.get('/col/Store front/folder.tiger')).toBe('meta {\n  seq: 1\n}\n')
    expect(within(sidebar()).queryByText('Store: front?')).toBeNull()

    await renameFolder('Store front', 'Store: v2?')
    await waitFor(() => expect(folderRow('Store: v2?')).toBeInTheDocument())
    expect(b.moveFile).toHaveBeenLastCalledWith('/col/Store front', '/col/Store- v2-')
    expect(files.get('/col/Store- v2-/folder.tiger')).toBe('meta {\n  name: Store: v2?\n  seq: 1\n}\n')
    // The folder page shows the same name.
    fireEvent.click(within(folderRow('Store: v2?')).getByText('Store: v2?'))
    expect(await screen.findByRole('heading', { name: /Store: v2\?/ })).toBeInTheDocument()
  })
})

describe('saving an in-memory collection keeps a folder name the disk cannot carry', () => {
  it('writes name: into folder.tiger and the sidebar still shows the typed name after Save', async () => {
    const disk = await fakeDisk()
    ;(window as { tiger?: unknown }).tiger = {
      ...disk,
      send: vi.fn(),
      getSettings: vi.fn().mockResolvedValue({ theme: 'system', timeoutMs: 30000, fontSize: 13, analyticsEnabled: false }),
      version: vi.fn().mockResolvedValue('test'),
      checkUpdate: vi.fn().mockResolvedValue(null),
      onUpdateDownloaded: vi.fn(),
      onShortcut: vi.fn(),
      historyRead: vi.fn().mockResolvedValue([]),
      track: vi.fn()
    }
    render(<App />)
    await waitFor(() => expect(folderRow('Users')).toBeInTheDocument())
    await renameFolder('Users', 'Users: v2?')
    await waitFor(() => expect(folderRow('Users: v2?')).toBeInTheDocument())

    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    expect(await screen.findByText(/Saved Demo collection in \/Docs\/Tiger\/Demo collection/)).toBeInTheDocument()
    expect(disk.files.get('/Docs/Tiger/Demo collection/Users- v2-/folder.tiger')).toContain('name: Users: v2?')
    expect([...disk.files.keys()].some((k) => k.startsWith('/Docs/Tiger/Demo collection/Users- v2-/'))).toBe(true)
    await waitFor(() => expect(folderRow('Users: v2?')).toBeInTheDocument())
    expect(sidebar().textContent).not.toContain('Users- v2-')
  })
})
