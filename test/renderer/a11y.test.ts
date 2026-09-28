import { afterEach, describe, expect, it } from 'vitest'
import {
  announce,
  ensureLiveRegions,
  isContextMenuKey,
  looksLikeError,
  rovingIndex
} from '../../src/renderer/src/a11y'

const polite = () => document.getElementById('tiger-live-polite')!
const assertive = () => document.getElementById('tiger-live-assertive')!

afterEach(() => {
  polite()?.remove()
  assertive()?.remove()
})

describe('announce()', () => {
  it('creates one polite and one assertive region, once', () => {
    ensureLiveRegions()
    ensureLiveRegions()
    expect(document.querySelectorAll('#tiger-live-polite')).toHaveLength(1)
    expect(polite()).toHaveAttribute('aria-live', 'polite')
    expect(polite()).toHaveAttribute('role', 'status')
    expect(polite()).toHaveAttribute('aria-atomic', 'true')
    expect(assertive()).toHaveAttribute('aria-live', 'assertive')
    expect(assertive()).toHaveAttribute('role', 'alert')
    expect(polite()).toHaveClass('sr-only')
  })

  it('writes polite messages to the polite region only', () => {
    announce('Saved')
    expect(polite().textContent).toBe('Saved')
    expect(assertive().textContent).toBe('')
  })

  it('writes errors to the assertive region', () => {
    announce('Request failed: timeout', { assertive: true })
    expect(assertive().textContent).toBe('Request failed: timeout')
    expect(polite().textContent).toBe('')
  })

  it('changes the text node when the same message repeats, so it re-announces', () => {
    announce('Saved')
    const first = polite().textContent
    announce('Saved')
    const second = polite().textContent
    announce('Saved')
    expect(second).not.toBe(first)
    expect(polite().textContent).toBe(first)
    expect(second?.trim()).toBe('Saved')
  })

  it('ignores empty messages', () => {
    announce('Saved')
    announce('')
    expect(polite().textContent).toBe('Saved')
  })
})

describe('looksLikeError()', () => {
  it.each([
    ['Import failed: bad json', true],
    ['Could not parse that as a curl command', true],
    ['Pre-request script error: x', true],
    ['Saved', false],
    ['Imported 4 requests from demo', false]
  ])('%s -> %s', (text, expected) => {
    expect(looksLikeError(text)).toBe(expected)
  })
})

describe('rovingIndex()', () => {
  it('wraps horizontally and handles Home/End', () => {
    expect(rovingIndex('ArrowRight', 2, 3)).toBe(0)
    expect(rovingIndex('ArrowLeft', 0, 3)).toBe(2)
    expect(rovingIndex('Home', 2, 3)).toBe(0)
    expect(rovingIndex('End', 0, 3)).toBe(2)
    expect(rovingIndex('ArrowDown', 0, 3)).toBeNull()
  })
  it('uses Up/Down for vertical widgets', () => {
    expect(rovingIndex('ArrowDown', 0, 3, 'vertical')).toBe(1)
    expect(rovingIndex('ArrowUp', 0, 3, 'vertical')).toBe(2)
    expect(rovingIndex('ArrowRight', 0, 3, 'vertical')).toBeNull()
  })
  it('returns null for empty widgets', () => {
    expect(rovingIndex('Home', 0, 0)).toBeNull()
  })
})

describe('isContextMenuKey()', () => {
  it('accepts Shift+F10 and the ContextMenu key only', () => {
    expect(isContextMenuKey({ key: 'F10', shiftKey: true })).toBe(true)
    expect(isContextMenuKey({ key: 'ContextMenu', shiftKey: false })).toBe(true)
    expect(isContextMenuKey({ key: 'F10', shiftKey: false })).toBe(false)
  })
})
