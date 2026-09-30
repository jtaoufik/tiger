import { BrowserWindow } from 'electron'

/**
 * Hidden helper windows (the isolated script host) that are not app windows:
 * menus, dialogs, "reopen on activate" and the quit logic must ignore them.
 */
const helperWindows = new WeakSet<BrowserWindow>()

export function markHelperWindow(win: BrowserWindow): void {
  helperWindows.add(win)
}

export function isHelperWindow(win: BrowserWindow | null | undefined): boolean {
  return !!win && helperWindows.has(win)
}

/** Every window except hidden helpers. */
export function appWindows(): BrowserWindow[] {
  return BrowserWindow.getAllWindows().filter((w) => !isHelperWindow(w))
}

/** The window an action should target: the focused app window, else the first. */
export function targetAppWindow(): BrowserWindow | undefined {
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && !isHelperWindow(focused)) return focused
  return appWindows()[0]
}
