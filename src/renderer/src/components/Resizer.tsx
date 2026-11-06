import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { isRtlDocument, logicalArrow } from '../a11y'

interface Props {
  direction: 'col' | 'row'
  /** Called with the pointer delta (px) since drag start; commit the new size. */
  onDrag: (delta: number) => void
  onEnd?: () => void
  /** Accessible name, e.g. "Resize sidebar". */
  label?: string
  /** Current size of the pane before the separator, in px (aria-valuenow). */
  value?: number
  min?: number
  max?: number
  /** Measures the current size when `value` is not tracked yet. */
  measure?: () => number
  /** Keyboard resize: called with the clamped new size. */
  onResize?: (size: number) => void
  /** id of the pane this separator sizes. */
  controls?: string
}

/** Pixels per arrow press; Shift makes it coarse. */
export const RESIZE_STEP = 16
export const RESIZE_STEP_LARGE = 64

/**
 * A slim drag handle between panes. Pointer-capture based, touch friendly,
 * and a focusable window splitter (role=separator) for keyboard users:
 * arrows resize, Shift+arrow resizes faster, Home/End go to min/max.
 */
export function Resizer({
  direction,
  onDrag,
  onEnd,
  label,
  value,
  min,
  max,
  measure,
  onResize,
  controls
}: Props) {
  const start = useRef(0)
  // A focusable separator must expose its position (aria-valuenow): when the
  // size is not tracked yet (the editor keeps its natural height), report the
  // measured one.
  const [measured, setMeasured] = useState<number | undefined>(undefined)
  useLayoutEffect(() => {
    if (value !== undefined || !measure || !onResize) return
    const now = Math.round(measure())
    if (now !== measured) setMeasured(now)
  })

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      start.current = direction === 'col' ? e.clientX : e.clientY
      const el = e.currentTarget
      el.setPointerCapture(e.pointerId)
      // In RTL the pane before a column separator sits on the right, so it
      // grows when the pointer moves left.
      const sign = direction === 'col' && isRtlDocument() ? -1 : 1

      const move = (ev: PointerEvent) => {
        onDrag(sign * ((direction === 'col' ? ev.clientX : ev.clientY) - start.current))
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

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onResize) return
    const current = value ?? measure?.() ?? 0
    const lo = min ?? 0
    const hi = max ?? Number.POSITIVE_INFINITY
    const step = e.shiftKey ? RESIZE_STEP_LARGE : RESIZE_STEP
    const shrink = direction === 'col' ? 'ArrowLeft' : 'ArrowUp'
    const grow = direction === 'col' ? 'ArrowRight' : 'ArrowDown'
    // Arrows follow the reading direction: in RTL, ArrowLeft grows a column pane.
    const key = direction === 'col' ? logicalArrow(e.key) : e.key
    let next: number | null = null
    if (key === shrink) next = current - step
    else if (key === grow) next = current + step
    else if (e.key === 'Home') next = lo
    else if (e.key === 'End' && Number.isFinite(hi)) next = hi
    if (next === null) return
    e.preventDefault()
    onResize(Math.round(Math.min(hi, Math.max(lo, next))))
  }

  const focusable = !!onResize
  return (
    <div
      className={`resizer ${direction}`}
      role="separator"
      aria-orientation={direction === 'col' ? 'vertical' : 'horizontal'}
      aria-label={label}
      aria-controls={controls}
      aria-valuenow={value !== undefined ? Math.round(value) : focusable ? measured : undefined}
      aria-valuemin={focusable ? min : undefined}
      aria-valuemax={focusable ? max : undefined}
      tabIndex={focusable ? 0 : undefined}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
    />
  )
}
