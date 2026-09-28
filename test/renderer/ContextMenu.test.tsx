import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { ContextMenu, type MenuItem } from '../../src/renderer/src/components/ContextMenu'

function Host({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Opener</button>
      <button>Elsewhere</button>
      {open && <ContextMenu x={10} y={10} items={items} label="Request actions" onClose={() => setOpen(false)} />}
    </>
  )
}

function openMenu(items: MenuItem[]) {
  render(<Host items={items} />)
  const opener = screen.getByRole('button', { name: 'Opener' })
  opener.focus()
  fireEvent.click(opener)
  return opener
}

const focused = () => document.activeElement as HTMLElement
const key = (k: string) => fireEvent.keyDown(focused(), { key: k })

const items = (spy = vi.fn()): MenuItem[] => [
  { label: 'Open', onClick: spy },
  { label: 'Duplicate', onClick: vi.fn() },
  'sep',
  { label: 'Copy as cURL', onClick: vi.fn() },
  { label: 'Delete', danger: true, onClick: vi.fn() }
]

describe('ContextMenu keyboard', () => {
  it('renders a labelled menu with menuitems and separators, focusing the first item', () => {
    openMenu(items())
    expect(screen.getByRole('menu', { name: 'Request actions' })).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem')).toHaveLength(4)
    expect(screen.getByRole('separator')).toBeInTheDocument()
    expect(focused()).toHaveTextContent('Open')
    // Roving: items are not individually tabbable.
    for (const mi of screen.getAllByRole('menuitem')) expect(mi).toHaveAttribute('tabindex', '-1')
  })

  it('Up/Down wrap, Home/End jump', () => {
    openMenu(items())
    key('ArrowUp')
    expect(focused()).toHaveTextContent('Delete')
    key('ArrowDown')
    expect(focused()).toHaveTextContent('Open')
    key('ArrowDown')
    expect(focused()).toHaveTextContent('Duplicate')
    key('End')
    expect(focused()).toHaveTextContent('Delete')
    key('Home')
    expect(focused()).toHaveTextContent('Open')
  })

  it('a letter jumps to the next item starting with it', () => {
    openMenu(items())
    key('c')
    expect(focused()).toHaveTextContent('Copy as cURL')
    key('d')
    expect(focused()).toHaveTextContent('Delete')
    key('d')
    expect(focused()).toHaveTextContent('Duplicate')
  })

  it('Escape closes and returns focus to the opener', () => {
    const opener = openMenu(items())
    key('Escape')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('Tab closes the menu too', () => {
    const opener = openMenu(items())
    key('Tab')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('choosing an item runs it, closes, and restores focus', () => {
    const spy = vi.fn()
    const opener = openMenu(items(spy))
    fireEvent.click(focused())
    expect(spy).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('clicking outside closes without stealing focus back', () => {
    openMenu(items())
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' })
    fireEvent.mouseDown(elsewhere)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Opener' })).not.toHaveFocus()
  })
})
