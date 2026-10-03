// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  enterHeadlessMode,
  headlessWebPreferences,
  headlessWindowOptions,
  isHeadless,
  mayShowWindow
} from '../../src/main/headless'

describe('headless automated runs', () => {
  it('is on for the e2e suite and the startup benchmark only', () => {
    expect(isHeadless({ TIGER_E2E: '1' })).toBe(true)
    expect(isHeadless({ TIGER_PERF_EXIT: '1' })).toBe(true)
    expect(isHeadless({})).toBe(false)
    expect(isHeadless({ TIGER_E2E: '0' })).toBe(false)
  })

  it('creates windows hidden, painting and unfocusable, and never shows them', () => {
    const opts = headlessWindowOptions(isHeadless({ TIGER_E2E: '1' }))
    expect(opts).toMatchObject({ show: false, paintWhenInitiallyHidden: true, focusable: false })
    expect(headlessWebPreferences(true)).toEqual({ backgroundThrottling: false })
    expect(mayShowWindow(true)).toBe(false)
  })

  it('leaves a normal launch untouched', () => {
    expect(headlessWindowOptions(false)).toEqual({})
    expect(headlessWebPreferences(false)).toEqual({})
    expect(mayShowWindow(false)).toBe(true)
  })

  it('hides the Dock icon and never activates the app on macOS', () => {
    const app = { setActivationPolicy: vi.fn(), dock: { hide: vi.fn() } }
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    try {
      enterHeadlessMode(app)
    } finally {
      Object.defineProperty(process, 'platform', platform)
    }
    expect(app.setActivationPolicy).toHaveBeenCalledWith('accessory')
    expect(app.dock.hide).toHaveBeenCalled()
  })

  it('main never shows, focuses or raises a window outside the headless gate', () => {
    const main = readFileSync(resolve(__dirname, '../../src/main/index.ts'), 'utf8')
    // Every show() is behind mayShowWindow(headless); nothing focuses or raises.
    const shows = main.match(/[.\w]+\.show\(\)/g) ?? []
    expect(shows.length).toBeGreaterThan(0)
    for (const line of main.split('\n').filter((l) => /\.show\(\)/.test(l))) {
      expect(line).toMatch(/mayShowWindow\(headless\)/)
    }
    // Focusing is only for a launch the user made (a second instance), behind the same gate.
    for (const line of main.split('\n').filter((l) => /\.focus\(\)/.test(l))) {
      expect(line).toMatch(/mayShowWindow\(headless\)/)
    }
    expect(main).not.toMatch(/\.(moveTop|showInactive)\(\)/)
    expect(main).toMatch(/\.\.\.headlessWindowOptions\(headless\)/)
    expect(main).toMatch(/\.\.\.headlessWebPreferences\(headless\)/)
    expect(main).toMatch(/if \(headless\) enterHeadlessMode\(app\)/)
  })

  it('the e2e harnesses launch headless', () => {
    const fixtures = readFileSync(resolve(__dirname, '../../e2e/fixtures.ts'), 'utf8')
    const scripts = readFileSync(resolve(__dirname, '../../scripts/e2e-scripts.mjs'), 'utf8')
    expect(fixtures).toMatch(/TIGER_E2E: '1'/)
    expect(scripts).toMatch(/TIGER_E2E: '1'/)
  })
})
