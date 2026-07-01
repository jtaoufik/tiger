/** Renderer-side platform detection and platform-idiomatic labels. */

export const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
export const IS_WIN =
  typeof navigator !== 'undefined' && /Win/i.test(navigator.platform)

/** Platform modifier label: Cmd on macOS, Ctrl elsewhere. */
export const MOD = IS_MAC ? 'Cmd' : 'Ctrl'

/** What each OS calls "show this file in the file manager". */
export const REVEAL_LABEL = IS_MAC
  ? 'Reveal in Finder'
  : IS_WIN
    ? 'Show in Explorer'
    : 'Show in file manager'
