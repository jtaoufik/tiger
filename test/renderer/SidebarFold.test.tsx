import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Sidebar, type SidebarCollection } from '../../src/renderer/src/components/Sidebar'

const shop: SidebarCollection = {
  id: 'c1',
  name: 'Shop API',
  entries: [
    { id: 'r1', name: 'List orders', method: 'get', folderPath: ['Orders'] },
    { id: 'r2', name: 'Health', method: 'get', folderPath: [] }
  ]
}

/** What an import or an opened folder brings in: nested folders, many requests. */
const imported: SidebarCollection = {
  id: 'imp',
  name: 'Imported API',
  entries: [
    { id: 'i1', name: 'List users', method: 'get', folderPath: ['Users'] },
    { id: 'i2', name: 'Get admin', method: 'get', folderPath: ['Users', 'Admin'] },
    { id: 'i3', name: 'List sales', method: 'get', folderPath: ['Sales'] },
    { id: 'i4', name: 'Ping', method: 'get', folderPath: [] }
  ]
}

function props(collections: SidebarCollection[], activeId: string | null) {
  return {
    collections,
    activeId,
    syncStates: {},
    onSelect: vi.fn(),
    onOpenCollection: vi.fn(),
    onNewCollection: vi.fn(),
    onClone: vi.fn(),
    onImportExport: vi.fn(),
    onNewRequest: vi.fn(),
    onCloseCollection: vi.fn(),
    onDeleteRequest: vi.fn(),
    onDuplicateRequest: vi.fn(),
    onGit: vi.fn(),
    onRequestMenu: vi.fn(),
    onCollectionMenu: vi.fn(),
    onFolderMenu: vi.fn(),
    onInspectCollection: vi.fn(),
    onInspectFolder: vi.fn(),
    onEmptyMenu: vi.fn(),
    onRenameRequest: vi.fn(),
    onRenameFolder: vi.fn(),
    onDuplicateFolder: vi.fn(),
    onMoveRequest: vi.fn()
  }
}

const item = (name: string) => screen.getByRole('treeitem', { name })
const shown = (name: string) => screen.queryByRole('treeitem', { name }) !== null

describe('Sidebar folding for collections that arrive later', () => {
  it('folds an imported collection, except the folders leading to the request it opens', () => {
    const { rerender } = render(<Sidebar {...props([shop], 'r1')} />)
    rerender(<Sidebar {...props([shop, imported], 'i3')} />)

    expect(item('Imported API')).toHaveAttribute('aria-expanded', 'true')
    expect(item('Users')).toHaveAttribute('aria-expanded', 'false')
    expect(shown('GET List users')).toBe(false)
    expect(item('Sales')).toHaveAttribute('aria-expanded', 'true')
    expect(shown('GET List sales')).toBe(true)
    expect(shown('GET Ping')).toBe(true)
    // The collection that was already open keeps its folders as they were.
    expect(item('Orders')).toHaveAttribute('aria-expanded', 'true')
  })

  it('unfolds the way to a request when it becomes active', () => {
    const { rerender } = render(<Sidebar {...props([shop], 'r1')} />)
    rerender(<Sidebar {...props([shop, imported], 'i4')} />)
    expect(shown('GET Get admin')).toBe(false)

    rerender(<Sidebar {...props([shop, imported], 'i2')} />)
    expect(item('Users')).toHaveAttribute('aria-expanded', 'true')
    expect(item('Admin')).toHaveAttribute('aria-expanded', 'true')
    expect(shown('GET Get admin')).toBe(true)
  })

  it('scrolls the tree so the request that becomes active is in view, without moving the Tab start', () => {
    const calls: string[] = []
    const scrollIntoView = Element.prototype.scrollIntoView
    const rect = Element.prototype.getBoundingClientRect
    // scrollIntoView would move Chromium's sequential focus navigation starting
    // point into the tree: the first Tab after a restart then skips the skip link.
    Element.prototype.scrollIntoView = function () {
      calls.push('scrollIntoView')
    }
    // The tree shows 0-400px; the active row sits at 900-920px.
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const box = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) })
      if ((this as HTMLElement).getAttribute('role') === 'tree') return box(0, 400) as DOMRect
      if ((this as HTMLElement).dataset?.entryId === 'i2') return box(900, 920) as DOMRect
      return box(0, 0) as DOMRect
    }
    vi.useFakeTimers()
    try {
      const { rerender } = render(<Sidebar {...props([shop], 'r1')} />)
      rerender(<Sidebar {...props([shop, imported], 'i2')} />)
      vi.runAllTimers()
      expect(screen.getByRole('tree').scrollTop).toBe(520)
      expect(calls).toEqual([])
    } finally {
      vi.useRealTimers()
      Element.prototype.scrollIntoView = scrollIntoView
      Element.prototype.getBoundingClientRect = rect
    }
  })

  it('folds a collection that is closed and opened again', () => {
    const { rerender } = render(<Sidebar {...props([shop], 'r2')} />)
    rerender(<Sidebar {...props([shop, imported], 'r2')} />)
    rerender(<Sidebar {...props([shop], 'r2')} />)
    rerender(<Sidebar {...props([shop, imported], 'r2')} />)
    expect(item('Users')).toHaveAttribute('aria-expanded', 'false')
    expect(item('Sales')).toHaveAttribute('aria-expanded', 'false')
  })
})
