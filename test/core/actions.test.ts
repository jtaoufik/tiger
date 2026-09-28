import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ACTIONS,
  DOCS_PAGES,
  REQUEST_SECTIONS,
  SHORTCUT_GROUPS,
  accelerator,
  docsUrl,
  getAction,
  matchActions,
  menuLabel,
  paletteActions,
  shortcutKeys,
  tooltip,
  type ActionDef
} from '../../src/core/actions'

const all = ACTIONS as readonly ActionDef[]

describe('action registry', () => {
  it('has unique ids', () => {
    const ids = all.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every action a label and a one-line description in plain copy', () => {
    for (const a of all) {
      expect(a.label.trim(), a.id).not.toBe('')
      expect(a.description.trim(), a.id).not.toBe('')
      expect(a.description, a.id).not.toMatch(/\n/)
      // Menus add the ellipsis; the label itself stays clean.
      expect(a.label, a.id).not.toMatch(/…$|\.\.\.$/)
      // House style: no em dashes in user-facing copy.
      expect(`${a.label} ${a.description}`, a.id).not.toMatch(/—/)
    }
  })

  it('never gives two actions the same label', () => {
    const labels = all.map((a) => a.label.toLowerCase())
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('never binds one shortcut to two actions', () => {
    const keys = all.filter((a) => a.shortcut).map((a) => shortcutKeys(a.id as never, 'Mod').join('+'))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('builds Electron accelerators and display keys from one shortcut', () => {
    expect(accelerator('send')).toBe('CmdOrCtrl+Return')
    expect(accelerator('command-palette')).toBe('CmdOrCtrl+K')
    // Ctrl+= must work on Windows, not only Ctrl+Plus.
    expect(accelerator('zoom-in')).toBe('CmdOrCtrl+=')
    expect(accelerator('jump-tab')).toBeUndefined()
    expect(accelerator('previous-tab')).toBe('Ctrl+Shift+Tab')
    expect(shortcutKeys('send', 'Cmd')).toEqual(['Cmd', 'Enter'])
    expect(shortcutKeys('rename', 'Ctrl')).toEqual(['F2'])
    expect(tooltip('new-request', 'Ctrl')).toBe('New request (Ctrl+T)')
    expect(tooltip('history', 'Cmd')).toBe('History')
  })

  it('adds an ellipsis in menus only for actions that ask for more input', () => {
    expect(menuLabel('import')).toBe('Import…')
    expect(menuLabel('send')).toBe('Send')
  })

  it('lists only real shortcuts in the shortcuts overlay groups', () => {
    for (const g of SHORTCUT_GROUPS) {
      for (const id of g.ids) expect(getAction(id).shortcut, id).toBeTruthy()
    }
  })

  it('links only to docs pages that exist in website/docs', () => {
    for (const page of DOCS_PAGES) {
      expect(existsSync(resolve(__dirname, `../../website/docs/${page}/index.html`)), page).toBe(true)
      expect(docsUrl(page)).toBe(`https://jtaoufik.github.io/tiger/docs/${page}/`)
    }
    const used = [...all.map((a) => a.docs), ...REQUEST_SECTIONS.map((s) => ('docs' in s ? s.docs : undefined))]
    for (const page of used.filter(Boolean)) expect(DOCS_PAGES).toContain(page)
  })
})

describe('command palette search', () => {
  it('hides navigation-only actions', () => {
    const ids = paletteActions().map((a) => a.id)
    expect(ids).toContain('import')
    expect(ids).not.toContain('next-tab')
    expect(ids).not.toContain('zoom-in')
  })

  it('finds actions by label, description and synonyms', () => {
    expect(matchActions('load')[0].id).toBe('load-test')
    // Old name still finds the renamed feature.
    expect(matchActions('perf').map((a) => a.id)).toContain('load-test')
    expect(matchActions('postman').map((a) => a.id)).toEqual(expect.arrayContaining(['import', 'export']))
    expect(matchActions('env').map((a) => a.id)).toContain('environments')
    expect(matchActions('zzzz')).toEqual([])
  })
})

describe('request editor sections', () => {
  it('uses plain names, most used first', () => {
    expect(REQUEST_SECTIONS.map((s) => s.label)).toEqual([
      'Params',
      'Body',
      'Headers',
      'Auth',
      'Save values',
      'Scripts & tests',
      'Notes',
      'Code snippet',
      'Load test'
    ])
  })

  it('explains Save values in one line', () => {
    const capture = REQUEST_SECTIONS.find((s) => s.id === 'capture')!
    expect(capture.description).toBe(
      'Store a value from the response into a variable for later requests'
    )
  })
})
