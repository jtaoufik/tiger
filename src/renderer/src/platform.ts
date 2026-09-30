import type { MessageKey } from '@core/i18n'

/** Renderer-side platform detection and platform-idiomatic labels. */

export const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
export const IS_WIN =
  typeof navigator !== 'undefined' && /Win/i.test(navigator.platform)

/** Platform modifier label: Cmd on macOS, Ctrl elsewhere. */
export const MOD = IS_MAC ? 'Cmd' : 'Ctrl'

/** What each OS calls "show this file in the file manager" (catalog key). */
export const REVEAL_LABEL_KEY: MessageKey = IS_MAC
  ? 'common.revealFinder'
  : IS_WIN
    ? 'common.revealExplorer'
    : 'common.revealFileManager'
