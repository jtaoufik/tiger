import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export type MenuItem =
  | { label: string; icon?: ReactNode; danger?: boolean; onClick: () => void }
  | 'sep'

interface Props {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

/** Custom right-click menu, glass-styled like the rest of the app. */
export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // Render offscreen first, then clamp using the menu's real size — estimates
  // drift with separators and long labels, and a bad clamp clips the menu.
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 })

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
    const buttons = (): HTMLButtonElement[] =>
      Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('.ctx-item') ?? [])
    // Native menus are keyboard-first: focus the first item on open…
    buttons()[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      // …and let arrows walk the items.
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault()
        const all = buttons()
        if (all.length === 0) return
        const current = all.indexOf(document.activeElement as HTMLButtonElement)
        const next =
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? all.length - 1
              : e.key === 'ArrowDown'
                ? (current + 1 + all.length) % all.length
                : (current - 1 + all.length) % all.length
        all[next]?.focus()
      }
    }
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('blur', onClose)
    // OS menus dismiss when the page under them moves.
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  return (
    <div className="ctx-menu" style={pos} ref={ref} role="menu">
      {items.map((item, i) =>
        item === 'sep' ? (
          <div className="ctx-sep" key={i} />
        ) : (
          <button
            key={i}
            className={`ctx-item ${item.danger ? 'danger' : ''}`}
            role="menuitem"
            onClick={() => {
              onClose()
              item.onClick()
            }}
          >
            {item.icon}
            {item.label}
          </button>
        )
      )}
    </div>
  )
}
