import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useT } from '../i18n'

export type MenuItem =
  | { label: string; icon?: ReactNode; danger?: boolean; onClick: () => void }
  | 'sep'

interface Props {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
  /** Accessible name of the menu, e.g. "Request actions". */
  label?: string
}

/**
 * Custom right-click menu, glass-styled like the rest of the app.
 *
 * Keyboard (WAI-ARIA menu): focus lands on the first item; Up/Down/Home/End
 * move (wrapping), a letter jumps to the next item starting with it,
 * Enter/Space activate, Esc or Tab close. When closed from the keyboard or by
 * choosing an item, focus returns to whatever opened the menu.
 */
export function ContextMenu({ x, y, items, onClose, label }: Props) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  // Render offscreen first, then clamp using the menu's real size — estimates
  // drift with separators and long labels, and a bad clamp clips the menu.
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 })
  // App passes a fresh onClose each render; keep the listeners stable anyway.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  /** Set when focus should go back to the opener as the menu unmounts. */
  const restore = useRef(false)

  useLayoutEffect(() => {
    const rect = ref.current?.getBoundingClientRect()
    const w = rect?.width ?? 230
    const h = rect?.height ?? items.length * 34
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - w - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - h - 4))
    })
  }, [x, y, items.length])

  useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const buttons = (): HTMLButtonElement[] =>
      Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    // Native menus are keyboard-first: focus the first item on open…
    buttons()[0]?.focus()
    const close = (restoreFocus: boolean) => {
      restore.current = restoreFocus
      onCloseRef.current()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        close(true)
        return
      }
      const all = buttons()
      if (all.length === 0) return
      const current = all.indexOf(document.activeElement as HTMLButtonElement)
      // …and let arrows walk the items.
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault()
        const next =
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? all.length - 1
              : e.key === 'ArrowDown'
                ? (current + 1 + all.length) % all.length
                : (current - 1 + all.length) % all.length
        all[next]?.focus()
        return
      }
      // First-letter navigation.
      if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const ch = e.key.toLowerCase()
        const order = [...all.slice(current + 1), ...all.slice(0, current + 1)]
        const hit = order.find((b) => (b.textContent ?? '').trim().toLowerCase().startsWith(ch))
        if (hit) {
          e.preventDefault()
          hit.focus()
        }
      }
    }
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close(false)
    }
    const onDismiss = () => close(false)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('blur', onDismiss)
    // OS menus dismiss when the page under them moves.
    window.addEventListener('scroll', onDismiss, true)
    window.addEventListener('resize', onDismiss)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('blur', onDismiss)
      window.removeEventListener('scroll', onDismiss, true)
      window.removeEventListener('resize', onDismiss)
      if (restore.current && opener?.isConnected && opener !== document.body) opener.focus()
    }
  }, [])

  return (
    <div
      className="ctx-menu"
      style={pos}
      ref={ref}
      role="menu"
      aria-label={label ?? t('sidebar.menu.actions')}
      aria-orientation="vertical"
    >
      {items.map((item, i) =>
        item === 'sep' ? (
          <div className="ctx-sep" key={i} role="separator" />
        ) : (
          <button
            type="button"
            key={i}
            className={`ctx-item ${item.danger ? 'danger' : ''}`}
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              restore.current = true
              onCloseRef.current()
              item.onClick()
            }}
          >
            {item.icon}
            <span className="ctx-label">{item.label}</span>
          </button>
        )
      )}
    </div>
  )
}
