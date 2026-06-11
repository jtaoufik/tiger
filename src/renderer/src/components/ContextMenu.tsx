import { useEffect, useRef, type ReactNode } from 'react'

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  // Keep the menu inside the viewport.
  const style: React.CSSProperties = {
    left: Math.min(x, (window.innerWidth || 1200) - 230),
    top: Math.min(y, (window.innerHeight || 800) - items.length * 34 - 20)
  }

  return (
    <div className="ctx-menu" style={style} ref={ref} role="menu">
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
