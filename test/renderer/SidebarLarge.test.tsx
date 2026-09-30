/**
 * The sidebar on a 2,000-request / 200-folder collection. Large trees render
 * only the rows near the viewport; these tests pin down that the ARIA tree
 * stays exact (nesting, levels, set sizes, positions, roving tabindex), that
 * keyboard navigation reaches rows that were not rendered, and that the work
 * per interaction stays bounded (DOM size, zero-mutation parent re-renders).
 */
import { Profiler } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import {
  SEARCH_DEBOUNCE_MS,
  Sidebar,
  WINDOW_MIN_ROWS,
  type SidebarCollection
} from '../../src/renderer/src/components/Sidebar'
import {
  LARGE,
  LARGE_FOLDERS,
  LARGE_REQUESTS,
  largeSidebarCollection
} from '../fixtures/largeCollection'

const large: SidebarCollection = largeSidebarCollection()

function props(extra: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  return {
    collections: [large],
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
}

const items = () => screen.getAllByRole('treeitem')
/** Numbers are printed with TIGER_PERF_REPORT=1 (for the PR table), silent otherwise. */
const report = (what: string, ms: number) => {
  if (process.env.TIGER_PERF_REPORT) console.log(`[perf] ${what}: ${ms.toFixed(1)} ms`)
}
/** Accessible name of the one fixture request whose name ends with `suffix`. */
const labelOf = (suffix: string) => {
  const e = large.entries.find((x) => x.name.endsWith(suffix))!
  return `${e.method.toUpperCase()} ${e.name}`
}
const focused = () => document.activeElement as HTMLElement

/** Every rendered treeitem must describe its real place in the full tree. */
function expectConsistentAria() {
  for (const el of items()) {
    // aria-level = number of treeitem ancestors + 1, and non-root items live
    // in a role=group owned by their parent treeitem.
    let level = 1
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (p.getAttribute('role') === 'treeitem') level++
    }
    expect(Number(el.getAttribute('aria-level'))).toBe(level)
    if (level > 1) expect(el.parentElement).toHaveAttribute('role', 'group')
    const pos = Number(el.getAttribute('aria-posinset'))
    const size = Number(el.getAttribute('aria-setsize'))
    expect(pos).toBeGreaterThanOrEqual(1)
    expect(pos).toBeLessThanOrEqual(size)
  }
  // Rendered siblings keep strictly increasing positions (gaps are spacers).
  for (const group of document.querySelectorAll('[role="group"]')) {
    const positions = [...group.children]
      .filter((c) => c.getAttribute('role') === 'treeitem')
      .map((c) => Number(c.getAttribute('aria-posinset')))
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(new Set(positions).size).toBe(positions.length)
  }
  // Spacers are invisible to assistive technology.
  for (const spacer of document.querySelectorAll('.tree-spacer')) {
    expect(spacer).toHaveAttribute('aria-hidden', 'true')
  }
}

describe('Sidebar with a 2,000-request collection', () => {
  it('fixture is 2,000 requests in 200 folders', () => {
    expect(large.entries).toHaveLength(LARGE_REQUESTS)
    const folders = new Set<string>()
    for (const e of large.entries) {
      for (let i = 1; i <= e.folderPath.length; i++) folders.add(e.folderPath.slice(0, i).join('/'))
    }
    expect(folders.size).toBe(LARGE_FOLDERS)
    expect(LARGE_REQUESTS + LARGE_FOLDERS).toBeGreaterThan(WINDOW_MIN_ROWS)
  })

  it('renders a bounded window of rows, not all 2,201', () => {
    render(<Sidebar {...props()} />)
    const count = items().length
    expect(count).toBeGreaterThan(20)
    expect(count).toBeLessThan(150)
    expect(document.querySelectorAll('.tree *').length).toBeLessThan(4000)
  })

  it('keeps nesting, levels, set sizes and positions exact', () => {
    render(<Sidebar {...props()} />)
    expectConsistentAria()
    const col = screen.getByRole('treeitem', { name: 'Large API' })
    expect(col).toHaveAttribute('aria-level', '1')
    expect(col).toHaveAttribute('aria-expanded', 'true')
    const service = screen.getByRole('treeitem', { name: 'Service 01' })
    expect(service).toHaveAttribute('aria-level', '2')
    expect(service).toHaveAttribute('aria-setsize', String(LARGE.topFolders))
    expect(service).toHaveAttribute('aria-posinset', '1')
    const sub = service.querySelector('[role="group"] > [role="treeitem"]')!
    expect(sub).toHaveAttribute('aria-level', '3')
    expect(sub).toHaveAttribute('aria-setsize', String(LARGE.subFolders))
  })

  it('has exactly one tabbable row', () => {
    render(<Sidebar {...props()} />)
    expect(items().filter((el) => el.tabIndex === 0)).toHaveLength(1)
  })

  it('End and Home reach rows that were not rendered, with focus and ARIA intact', () => {
    render(<Sidebar {...props()} />)
    const last = large.entries.filter((e) => e.folderPath[0] === 'Service 20').at(-1)!
    expect(screen.queryByRole('treeitem', { name: `${last.method.toUpperCase()} ${last.name}` })).toBeNull()

    act(() => items()[0].focus())
    fireEvent.keyDown(focused(), { key: 'End' })
    expect(focused()).toHaveAccessibleName(`${last.method.toUpperCase()} ${last.name}`)
    expect(focused()).toHaveAttribute('aria-level', '4')
    expect(focused().getAttribute('aria-posinset')).toBe(focused().getAttribute('aria-setsize'))
    expect(items().filter((el) => el.tabIndex === 0)).toEqual([focused()])
    expectConsistentAria()

    fireEvent.keyDown(focused(), { key: 'Home' })
    expect(focused()).toHaveAccessibleName('Large API')
    expect(items().filter((el) => el.tabIndex === 0)).toEqual([focused()])
  })

  it('mounts and re-renders within budget', () => {
    // What every keystroke in the request editor does to the sidebar. Rows are
    // memoized behind a stable api, so the update re-renders no row.
    const durations: Record<string, number[]> = { mount: [], update: [] }
    const onRender = (_id: string, phase: string, actual: number) => {
      ;(phase === 'mount' ? durations.mount : durations.update).push(actual)
    }
    const { rerender } = render(
      <Profiler id="sidebar" onRender={onRender}>
        <Sidebar {...props()} />
      </Profiler>
    )
    for (let i = 0; i < 5; i++) {
      rerender(
        <Profiler id="sidebar" onRender={onRender}>
          <Sidebar {...props()} />
        </Profiler>
      )
    }
    const mount = durations.mount[0]
    const sorted = [...durations.update].sort((a, b) => a - b)
    const update = sorted[sorted.length >> 1]
    report('sidebar mount (jsdom, React actualDuration)', mount)
    report('sidebar parent re-render (jsdom, React actualDuration)', update)
    // Before windowing + memoized rows: ~4,000 ms mount, ~525 ms update on the
    // same machine. Budgets leave a wide margin for slow CI runners.
    expect(mount).toBeLessThan(400)
    expect(update).toBeLessThan(50)
  })

  it('a parent re-render with new callbacks touches no DOM', () => {
    const { rerender } = render(<Sidebar {...props()} />)
    const tree = screen.getByRole('tree')
    const records: MutationRecord[] = []
    const observer = new MutationObserver((r) => records.push(...r))
    observer.observe(tree, { subtree: true, childList: true, attributes: true, characterData: true })
    rerender(<Sidebar {...props()} />)
    rerender(<Sidebar {...props({ syncStates: {} })} />)
    records.push(...observer.takeRecords())
    observer.disconnect()
    expect(records).toHaveLength(0)
  })

  it('debounces search: the box updates at once, the tree after a pause', () => {
    vi.useFakeTimers()
    try {
      render(<Sidebar {...props()} />)
      const search = screen.getByRole('searchbox', { name: 'Search requests' })
      fireEvent.change(search, { target: { value: 'coupons 0007' } })
      expect(search).toHaveValue('coupons 0007')
      expect(screen.getByRole('treeitem', { name: 'Service 01' })).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
      })
      expect(screen.queryByRole('treeitem', { name: 'Service 01' })).toBeNull()
      const hits = items().filter((el) => el.getAttribute('aria-level') === '2')
      expect(hits.map((el) => el.getAttribute('aria-label'))).toEqual([labelOf('coupons 0007')])

      // Clearing applies immediately.
      fireEvent.keyDown(search, { key: 'Escape' })
      expect(screen.getByRole('treeitem', { name: 'Service 01' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ArrowDown during a pending search applies it and enters the results', () => {
    vi.useFakeTimers()
    try {
      render(<Sidebar {...props()} />)
      const search = screen.getByRole('searchbox', { name: 'Search requests' })
      fireEvent.change(search, { target: { value: 'coupons 0015' } })
      fireEvent.keyDown(search, { key: 'ArrowDown' })
      expect(focused()).toHaveAccessibleName(labelOf('coupons 0015'))
    } finally {
      vi.useRealTimers()
    }
  })

  it('renaming keeps the edited row rendered and focus returns to it', () => {
    render(<Sidebar {...props()} />)
    act(() => items()[0].focus())
    fireEvent.keyDown(focused(), { key: 'End' })
    const row = focused()
    fireEvent.keyDown(row, { key: 'F2' })
    const input = screen.getByRole('textbox', { name: /^Rename / })
    fireEvent.change(input, { target: { value: 'Renamed' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(focused().getAttribute('data-node-key')).toBe(row.getAttribute('data-node-key'))
  })
})
