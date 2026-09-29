/**
 * Shared accessibility primitives for the renderer. DOM-only, no React, so any
 * component (or plain callback) can use them.
 *
 * - announce(): screen-reader announcements through two persistent live
 *   regions (polite + assertive) appended to <body>.
 * - rovingIndex(): arrow/Home/End math for tablists, menus and toolbars.
 * - isContextMenuKey() / menuAnchor(): open custom context menus from the
 *   keyboard (Shift+F10 or the ContextMenu key) at the focused element.
 *
 * CSS companions live in styles.css: .sr-only (visually hidden),
 * .skip-link, and the --focus-ring / --focus-width tokens.
 */

export type Politeness = 'polite' | 'assertive'

const REGION_ID: Record<Politeness, string> = {
  polite: 'tiger-live-polite',
  assertive: 'tiger-live-assertive'
}

/**
 * Create the live regions if they are missing. Call once at app start: a
 * region must already be in the DOM before its text changes, or some screen
 * readers ignore the first message.
 */
export function ensureLiveRegions(doc: Document = document): void {
  for (const politeness of ['polite', 'assertive'] as const) {
    if (doc.getElementById(REGION_ID[politeness])) continue
    const region = doc.createElement('div')
    region.id = REGION_ID[politeness]
    region.className = 'sr-only'
    region.setAttribute('aria-live', politeness)
    region.setAttribute('aria-atomic', 'true')
    // role adds legacy support (status = polite, alert = assertive).
    region.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status')
    doc.body.appendChild(region)
  }
}

/**
 * Announce a message to assistive technology. Errors should pass
 * `{ assertive: true }`; everything else stays polite so it never interrupts.
 * Repeating the same message still re-announces (a trailing no-break space
 * toggles so the text node always changes).
 */
export function announce(message: string, opts: { assertive?: boolean } = {}): void {
  if (typeof document === 'undefined' || !message) return
  ensureLiveRegions()
  const politeness: Politeness = opts.assertive ? 'assertive' : 'polite'
  const region = document.getElementById(REGION_ID[politeness])
  if (!region) return
  const current = region.textContent ?? ''
  const repeat = current.replace(/ $/, '') === message
  region.textContent = repeat && !current.endsWith(' ') ? `${message} ` : message
}

/** Heuristic used by App's toast(): failures are announced assertively. */
export function looksLikeError(text: string): boolean {
  return /\b(fail(ed|s)?|error|could not|cannot|can't|invalid|denied|refused)\b/i.test(text)
}

/**
 * Next index for a roving-focus widget, or null when the key is not a
 * navigation key for that orientation. Wraps around at both ends.
 */
export function rovingIndex(
  key: string,
  current: number,
  count: number,
  orientation: 'horizontal' | 'vertical' = 'horizontal'
): number | null {
  if (count <= 0) return null
  const prev = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp'
  const next = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown'
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (key === next) return current < 0 ? 0 : (current + 1) % count
  if (key === prev) return current < 0 ? count - 1 : (current - 1 + count) % count
  return null
}

/** Shift+F10 or the dedicated ContextMenu key. */
export function isContextMenuKey(e: { key: string; shiftKey: boolean }): boolean {
  return e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')
}

/** Where a keyboard-opened context menu should appear for an element. */
export function menuAnchor(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect()
  return { x: Math.round(r.left + Math.min(24, r.width / 2)), y: Math.round(r.bottom) }
}
