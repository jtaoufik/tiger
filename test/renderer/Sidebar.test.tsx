import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { Sidebar, type SidebarCollection } from '../../src/renderer/src/components/Sidebar'

const collections: SidebarCollection[] = [
  {
    id: 'c1',
    name: 'Shop API',
    entries: [
      { id: 'r1', name: 'List orders', method: 'get', folderPath: ['Orders'] },
      { id: 'r2', name: 'Create order', method: 'post', folderPath: ['Orders'] },
      { id: 'r3', name: 'Health', method: 'get', folderPath: [] }
    ]
  },
  { id: 'c2', name: 'Billing', entries: [{ id: 'r4', name: 'Invoice', method: 'put', folderPath: [] }] }
]

function setup(extra: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const props = {
    collections,
    activeId: null,
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
    onMoveRequest: vi.fn(),
    ...extra
  }
  render(<Sidebar {...props} />)
  return props
}

const item = (name: string) => screen.getByRole('treeitem', { name })
const focused = () => document.activeElement as HTMLElement
const key = (k: string, init: Partial<KeyboardEventInit> = {}) =>
  fireEvent.keyDown(focused(), { key: k, ...init })

describe('Sidebar ARIA tree', () => {
  it('exposes a labelled tree with levels, set sizes and positions', () => {
    setup()
    const tree = screen.getByRole('tree', { name: 'Collections' })
    expect(tree).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Collections' })).toBeInTheDocument()
    const shop = item('Shop API')
    expect(shop).toHaveAttribute('aria-level', '1')
    expect(shop).toHaveAttribute('aria-setsize', '2')
    expect(shop).toHaveAttribute('aria-posinset', '1')
    expect(shop).toHaveAttribute('aria-expanded', 'true')
    const orders = item('Orders')
    expect(orders).toHaveAttribute('aria-level', '2')
    expect(orders).toHaveAttribute('aria-setsize', '2')
    const list = item('GET List orders')
    expect(list).toHaveAttribute('aria-level', '3')
    expect(list).toHaveAttribute('aria-posinset', '1')
    expect(list).not.toHaveAttribute('aria-expanded')
    // Children live in a role=group inside their parent treeitem.
    expect(within(orders).getByRole('group')).toContainElement(list)
  })

  it('has exactly one tabbable item (roving tabindex), the active request', () => {
    setup({ activeId: 'r2' })
    const tabbable = screen.getAllByRole('treeitem').filter((el) => el.tabIndex === 0)
    expect(tabbable).toHaveLength(1)
    expect(tabbable[0]).toHaveAccessibleName('POST Create order')
    expect(tabbable[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('walks rows with Up/Down and jumps with Home/End', () => {
    setup()
    item('Shop API').focus()
    key('ArrowDown')
    expect(focused()).toHaveAccessibleName('Orders')
    key('ArrowDown')
    expect(focused()).toHaveAccessibleName('GET List orders')
    key('ArrowUp')
    expect(focused()).toHaveAccessibleName('Orders')
    key('End')
    expect(focused()).toHaveAccessibleName('PUT Invoice')
    key('Home')
    expect(focused()).toHaveAccessibleName('Shop API')
    // The focused row is now the single tab stop.
    expect(item('Shop API').tabIndex).toBe(0)
    expect(item('Orders').tabIndex).toBe(-1)
  })

  it('Left collapses an open node, then moves to its parent; Right expands, then enters', () => {
    setup()
    item('Orders').focus()
    key('ArrowLeft')
    expect(item('Orders')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('treeitem', { name: 'GET List orders' })).not.toBeInTheDocument()
    key('ArrowLeft')
    expect(focused()).toHaveAccessibleName('Shop API')
    key('ArrowDown')
    expect(focused()).toHaveAccessibleName('Orders')
    key('ArrowRight')
    expect(item('Orders')).toHaveAttribute('aria-expanded', 'true')
    key('ArrowRight')
    expect(focused()).toHaveAccessibleName('GET List orders')
    key('ArrowLeft')
    expect(focused()).toHaveAccessibleName('Orders')
  })

  it('Enter opens requests, folders and collections', () => {
    const p = setup()
    item('GET List orders').focus()
    key('Enter')
    expect(p.onSelect).toHaveBeenCalledWith('r1')
    item('Orders').focus()
    key('Enter')
    expect(p.onInspectFolder).toHaveBeenCalledWith('c1', ['Orders'])
    item('Billing').focus()
    key(' ')
    expect(p.onInspectCollection).toHaveBeenCalledWith('c2')
  })

  it('F2 renames the focused request and returns focus to the row', () => {
    const p = setup()
    item('GET Health').focus()
    key('F2')
    const input = screen.getByRole('textbox', { name: 'Rename Health' })
    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: 'Ping' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(p.onRenameRequest).toHaveBeenCalledWith('r3', 'Ping')
    expect(focused()).toHaveAccessibleName('GET Health')
  })

  it('F2 renames a focused folder', () => {
    const p = setup()
    item('Orders').focus()
    key('F2')
    const input = screen.getByRole('textbox', { name: 'Rename folder Orders' })
    fireEvent.change(input, { target: { value: 'Sales' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(p.onRenameFolder).toHaveBeenCalledWith('c1', ['Orders'], 'Sales')
  })

  it('Shift+F10 and the ContextMenu key open the right context menu', () => {
    const p = setup()
    item('POST Create order').focus()
    key('F10', { shiftKey: true })
    expect(p.onRequestMenu).toHaveBeenCalledWith('r2', expect.any(Number), expect.any(Number))
    item('Orders').focus()
    key('ContextMenu')
    expect(p.onFolderMenu).toHaveBeenCalledWith('c1', ['Orders'], expect.any(Number), expect.any(Number))
    item('Billing').focus()
    key('ContextMenu')
    expect(p.onCollectionMenu).toHaveBeenCalledWith('c2', expect.any(Number), expect.any(Number))
  })

  it('type-ahead jumps to the next row starting with the typed letter', () => {
    setup()
    item('Shop API').focus()
    key('i')
    expect(focused()).toHaveAccessibleName('PUT Invoice')
  })

  it('Delete asks to delete the focused request', () => {
    const p = setup()
    item('GET Health').focus()
    key('Delete')
    expect(p.onDeleteRequest).toHaveBeenCalledWith('r3')
  })

  it('marks the inspected folder as selected', () => {
    setup({ inspected: { colId: 'c1', path: ['Orders'] } })
    expect(item('Orders')).toHaveAttribute('aria-selected', 'true')
    expect(item('Shop API')).toHaveAttribute('aria-selected', 'false')
  })

  it('icon-only row buttons are named and kept out of the Tab order', () => {
    setup()
    const btn = screen.getAllByRole('button', { name: 'Delete request' })[0]
    expect(btn).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute('title', expect.stringMatching(/^Open collection/))
    expect(screen.getAllByRole('button', { name: /^More actions for/ })[0]).toHaveAttribute('tabindex', '-1')
  })

  it('search shows an empty state when nothing matches, and ArrowDown enters results', () => {
    setup()
    const search = screen.getByRole('searchbox', { name: 'Search requests' })
    fireEvent.change(search, { target: { value: 'zzz' } })
    expect(screen.getByRole('status')).toHaveTextContent('No requests match zzz')
    fireEvent.change(search, { target: { value: 'order' } })
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    expect(focused()).toHaveAccessibleName('GET List orders')
  })
})
