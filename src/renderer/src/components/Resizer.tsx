import { useCallback, useRef } from 'react'

interface Props {
  direction: 'col' | 'row'
  /** Called with the pointer delta (px) since drag start; commit the new size. */
  onDrag: (delta: number) => void
  onEnd?: () => void
}

/** A slim drag handle between panes. Pointer-capture based, touch friendly. */
export function Resizer({ direction, onDrag, onEnd }: Props) {
  const start = useRef(0)

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      start.current = direction === 'col' ? e.clientX : e.clientY
      const el = e.currentTarget
      el.setPointerCapture(e.pointerId)

      const move = (ev: PointerEvent) => {
        onDrag((direction === 'col' ? ev.clientX : ev.clientY) - start.current)
      }
      const up = () => {
        el.removeEventListener('pointermove', move)
        el.removeEventListener('pointerup', up)
        onEnd?.()
      }
      el.addEventListener('pointermove', move)
      el.addEventListener('pointerup', up)
    },
    [direction, onDrag, onEnd]
  )

  return (
    <div
      className={`resizer ${direction}`}
      role="separator"
      aria-orientation={direction === 'col' ? 'vertical' : 'horizontal'}
      onPointerDown={onPointerDown}
    />
  )
}
