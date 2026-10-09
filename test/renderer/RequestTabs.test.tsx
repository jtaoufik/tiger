import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { RequestTabs, type RequestTab } from '../../src/renderer/src/components/RequestTabs'

const initial: RequestTab[] = [
  { key: 'a', kind: 'request', label: 'List users', method: 'get' },
  { key: 'b', kind: 'request', label: 'Create user', method: 'post', dirty: true },
  { key: 'c', kind: 'folder', label: 'Orders' },
  { key: 'd', kind: 'collection', label: 'Shop API' }
]

/** Stateful host so close/select behave like App. */
function Host({ onMenu = vi.fn() }: { onMenu?: (k: string, x: number, y: number) => void }) {
  const [tabs, setTabs] = useState(initial)
  const [active, setActive] = useState<string | null>('a')
  return (
    <RequestTabs
      tabs={tabs}
      activeKey={active}
      panelId="panel"
      onSelect={setActive}
      onClose={(key) => {
        setTabs((t) => t.filter((x) => x.key !== key))
        if (active === key) setActive(null)
      }}
      onTabMenu={onMenu}
      onReorder={() => {}}
    />
  )
}

const tab = (name: string | RegExp) => screen.getByRole('tab', { name })
const focused = () => document.activeElement as HTMLElement

describe('RequestTabs tablist', () => {
  it('is a labelled tablist with named tabs and one tab stop', () => {
    render(<Host />)
    expect(screen.getByRole('tablist', { name: 'Open tabs' })).toBeInTheDocument()
    expect(tab('GET List users')).toHaveAttribute('aria-selected', 'true')
    expect(tab('GET List users')).toHaveAttribute('aria-controls', 'panel')
    expect(tab('POST Create user, unsaved changes')).toHaveAttribute('aria-selected', 'false')
    expect(tab('Folder Orders')).toBeInTheDocument()
    expect(tab('Collection Shop API')).toBeInTheDocument()
    const stops = screen.getAllByRole('tab').filter((t) => t.tabIndex === 0)
    expect(stops).toEqual([tab('GET List users')])
  })

  it('arrow keys move focus with wrap-around; Home/End jump', () => {
    render(<Host />)
    tab('GET List users').focus()
    fireEvent.keyDown(focused(), { key: 'ArrowRight' })
    expect(focused()).toBe(tab(/Create user/))
    fireEvent.keyDown(focused(), { key: 'End' })
    expect(focused()).toBe(tab('Collection Shop API'))
    fireEvent.keyDown(focused(), { key: 'ArrowRight' })
    expect(focused()).toBe(tab('GET List users'))
    fireEvent.keyDown(focused(), { key: 'ArrowLeft' })
    expect(focused()).toBe(tab('Collection Shop API'))
    fireEvent.keyDown(focused(), { key: 'Home' })
    expect(focused()).toBe(tab('GET List users'))
    // Manual activation: moving focus does not select.
    fireEvent.keyDown(focused(), { key: 'ArrowRight' })
    expect(tab('GET List users')).toHaveAttribute('aria-selected', 'true')
    expect(focused().tabIndex).toBe(0)
  })

  it('Enter and Space activate the focused tab', () => {
    render(<Host />)
    tab('GET List users').focus()
    fireEvent.keyDown(focused(), { key: 'ArrowRight' })
    fireEvent.keyDown(focused(), { key: 'Enter' })
    expect(tab(/Create user/)).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(focused(), { key: 'ArrowRight' })
    fireEvent.keyDown(focused(), { key: ' ' })
    expect(tab('Folder Orders')).toHaveAttribute('aria-selected', 'true')
  })

  it('Delete closes the focused tab and focus moves to its neighbour', () => {
    render(<Host />)
    tab(/Create user/).focus()
    fireEvent.keyDown(focused(), { key: 'Delete' })
    expect(screen.queryByRole('tab', { name: /Create user/ })).not.toBeInTheDocument()
    expect(focused()).toBe(tab('Folder Orders'))
  })

  it('the close mark is pointer only: no control nested in a tab, Delete announced instead', () => {
    const { container } = render(<Host />)
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(tab('Folder Orders')).toHaveAttribute('aria-keyshortcuts', 'Delete')
    const close = tab('Folder Orders').querySelector('.request-tab-close')!
    expect(close).toHaveAttribute('aria-hidden', 'true')
    expect(close).not.toHaveAttribute('tabindex')
    fireEvent.click(close)
    expect(screen.queryByRole('tab', { name: 'Folder Orders' })).not.toBeInTheDocument()
    expect(container.querySelectorAll('[role=tab] :is(button, [tabindex])')).toHaveLength(0)
  })

  it('Shift+F10 opens the tab menu for the focused tab', () => {
    const onMenu = vi.fn()
    render(<Host onMenu={onMenu} />)
    tab('Folder Orders').focus()
    fireEvent.keyDown(focused(), { key: 'F10', shiftKey: true })
    expect(onMenu).toHaveBeenCalledWith('c', expect.any(Number), expect.any(Number))
  })
})
