import { useEffect, useRef, type ReactNode } from 'react'
import { CloseIcon } from './Icons'
import './Modal.css'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  width?: number
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({ title, onClose, children, width = 560 }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // If a child already claimed focus (autoFocus inputs — e.g. PromptModal's
    // name field), leave it alone; passive effects run after React applies
    // autoFocus, so grabbing focus here would silently defeat it. Otherwise
    // land on the first focusable control so keyboard users can type/Enter
    // right away, with the container as a last resort for the focus trap.
    const dialog = dialogRef.current
    if (!dialog || dialog.contains(document.activeElement)) return
    const first = dialog.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? dialog).focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
        ).filter((el) => el.offsetParent !== null)
        if (focusable.length === 0) {
          e.preventDefault()
          return
        }
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first || document.activeElement === dialogRef.current) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last || document.activeElement === dialogRef.current) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="modal"
        style={{ width }}
        role="dialog"
        aria-label={title}
        aria-modal="true"
        tabIndex={-1}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} title="Close" aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
