/**
 * Automated runs never put a window on screen. The e2e suite (TIGER_E2E=1),
 * scripts/e2e-scripts.mjs and the startup benchmark (TIGER_PERF_EXIT=1) run on
 * people's own machines: a Tiger window popping up, a Dock icon bouncing or
 * focus being stolen interrupts whatever they are doing. Headless windows are
 * created hidden, keep painting (so screenshots and layout still work), are
 * never shown or focused, and on macOS the app never activates.
 */
import type { BrowserWindowConstructorOptions } from 'electron'

type Env = Record<string, string | undefined>

export function isHeadless(env: Env = process.env): boolean {
  return env.TIGER_E2E === '1' || env.TIGER_PERF_EXIT === '1'
}

/** Options merged into every app window. Empty for a normal launch. */
export function headlessWindowOptions(headless: boolean): Partial<BrowserWindowConstructorOptions> {
  if (!headless) return {}
  return {
    show: false,
    // Keep rendering while hidden: CDP screenshots and layout need frames.
    paintWhenInitiallyHidden: true,
    focusable: false,
    skipTaskbar: true
  }
}

/** webPreferences for headless windows: timers and rAF must not be throttled. */
export function headlessWebPreferences(headless: boolean): { backgroundThrottling?: boolean } {
  return headless ? { backgroundThrottling: false } : {}
}

/** Whether a created window may be shown (ready-to-show, activate, ...). */
export function mayShowWindow(headless: boolean): boolean {
  return !headless
}

/**
 * Before any window exists: on macOS, an accessory app has no Dock icon and
 * never becomes the active app, so nothing steals focus.
 */
export function enterHeadlessMode(app: {
  setActivationPolicy?: (policy: 'regular' | 'accessory' | 'prohibited') => void
  dock?: { hide: () => void }
}): void {
  if (process.platform !== 'darwin') return
  app.setActivationPolicy?.('accessory')
  app.dock?.hide()
}
