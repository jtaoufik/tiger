import type { KeyboardEvent } from 'react'
import { logicalArrow } from '../a11y'

/**
 * WAI-ARIA tabs with automatic activation: Left/Right (and Up/Down) move and
 * select, Home/End jump to the ends, focus follows the selected tab. In a
 * right-to-left layout Left moves to the next tab (reading order).
 * Ids are derived from a per-instance prefix so tabs and panels can point at
 * each other with aria-controls / aria-labelledby.
 */
export function tablist<T extends string>(prefix: string, ids: readonly T[], current: T, select: (id: T) => void) {
  const tabId = (id: T) => `${prefix}-tab-${id}`
  const panelId = (id: T) => `${prefix}-panel-${id}`

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const i = ids.indexOf(current)
    let next = -1
    switch (logicalArrow(e.key)) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (i + 1) % ids.length
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (i - 1 + ids.length) % ids.length
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = ids.length - 1
        break
      default:
        return
    }
    e.preventDefault()
    const id = ids[next]
    select(id)
    // The tab already exists (all tabs render), so focus can move right away.
    const scope = e.currentTarget.ownerDocument ?? document
    scope.getElementById(tabId(id))?.focus()
  }

  /** Props for one tab button. */
  const tab = (id: T) => ({
    role: 'tab' as const,
    id: tabId(id),
    'aria-selected': id === current,
    'aria-controls': panelId(id),
    tabIndex: id === current ? 0 : -1,
    onClick: () => select(id)
  })

  /** Props for the panel showing `current`. */
  const panel = () => ({
    role: 'tabpanel' as const,
    id: panelId(current),
    'aria-labelledby': tabId(current),
    tabIndex: 0
  })

  return { onKeyDown, tab, panel, tabId, panelId }
}
