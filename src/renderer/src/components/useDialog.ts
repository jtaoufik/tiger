import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

export const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]'
].join(', ')

/**
 * Focusable descendants in tab order, minus anything hidden or inert.
 * `checkVisibility` is missing in jsdom, where everything counts as visible.
 */
export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if (el.closest('[hidden], [inert]')) return false
    const check = (el as HTMLElement & { checkVisibility?: () => boolean }).checkVisibility
    return typeof check !== 'function' || check.call(el)
  })
}

// Open dialogs in mount order. Only the top one reacts to Esc and Tab, so a
// confirm opened over another modal closes alone.
interface Entry {
  id: symbol
  el: HTMLElement
}
const stack: Entry[] = []

/**
 * The dialog that owns the keyboard: the most recently opened one that does
 * not contain another open dialog (children mount first when a parent and a
 * nested child open in the same commit).
 */
function topId(): symbol | undefined {
  for (let i = stack.length - 1; i >= 0; i--) {
    const e = stack[i]
    if (!stack.some((o) => o !== e && e.el.contains(o.el))) return e.id
  }
  return undefined
}

/** Live regions (toasts) stay readable while a modal is open. */
function keepOutside(el: Element): boolean {
  return (
    el.tagName === 'SCRIPT' ||
    el.tagName === 'STYLE' ||
    el.hasAttribute('aria-live') ||
    el.getAttribute('role') === 'status' ||
    el.getAttribute('role') === 'alert' ||
    el.classList.contains('toasts')
  )
}

/**
 * Mark everything outside `root` inert: walk up to <body> and flag each
 * ancestor's siblings. Returns the elements we changed so cleanup only
 * undoes our own work (a nested dialog must not un-inert its parent's world).
 */
function inertOutside(root: HTMLElement): Element[] {
  const changed: Element[] = []
  let node: HTMLElement = root
  while (node !== document.body && node.parentElement) {
    for (const sib of Array.from(node.parentElement.children)) {
      if (sib === node || sib.hasAttribute('inert') || keepOutside(sib)) continue
      sib.setAttribute('inert', '')
      changed.push(sib)
    }
    node = node.parentElement
  }
  return changed
}

/** Where focus lands on open: explicit marker, then the first field, then any control. */
function initialTarget(dialog: HTMLElement): HTMLElement {
  const marked = dialog.querySelector<HTMLElement>('[data-autofocus]')
  if (marked) return marked
  const body = dialog.querySelector<HTMLElement>('.modal-body') ?? dialog
  const fields = focusableIn(body)
  const field = fields.find((el) => /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName))
  return field ?? fields[0] ?? focusableIn(dialog)[0] ?? dialog
}

/**
 * Modal dialog behaviour shared by <Modal> and the command palette:
 * background inert + scroll lock, initial focus, Tab/Shift+Tab trap, Esc to
 * close, and focus returned to whatever opened the dialog.
 */
export function useDialog(
  backdropRef: RefObject<HTMLElement | null>,
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void
): void {
  // Captured during render, before autoFocus or our effects move focus.
  const [opener] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)
  )
  const idRef = useRef<symbol | null>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useLayoutEffect(() => {
    const backdrop = backdropRef.current
    const dialog = dialogRef.current
    if (!backdrop || !dialog) return
    const id = Symbol('dialog')
    idRef.current = id
    stack.push({ id, el: backdrop })

    const inerted = inertOutside(backdrop)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // A child that already took focus (autoFocus) keeps it.
    if (!dialog.contains(document.activeElement)) initialTarget(dialog).focus()

    return () => {
      const at = stack.findIndex((e) => e.id === id)
      if (at !== -1) stack.splice(at, 1)
      for (const el of inerted) el.removeAttribute('inert')
      document.body.style.overflow = prevOverflow
      if (opener && opener.isConnected && opener !== document.body) opener.focus()
    }
  }, [backdropRef, dialogRef, opener])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (topId() !== idRef.current) return
      const dialog = dialogRef.current
      if (!dialog) return
      if (e.key === 'Escape') {
        // A widget inside (search box, open menu) that handled Esc wins.
        if (e.defaultPrevented) return
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusableIn(dialog)
      if (items.length === 0) {
        e.preventDefault()
        dialog.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      const outside = !dialog.contains(active) || active === dialog
      if (e.shiftKey && (active === first || outside)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || outside)) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialogRef])
}
