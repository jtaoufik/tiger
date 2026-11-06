import { describe, expect, it, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getVersion: () => '0.0.0',
    getLocale: () => 'en-US',
    getPreferredSystemLanguages: () => ['en-US'],
    commandLine: { hasSwitch: () => false }
  },
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  dialog: { showMessageBox: vi.fn() },
  Menu: { setApplicationMenu: vi.fn(), buildFromTemplate: vi.fn((t) => t) },
  nativeImage: { createFromPath: vi.fn() },
  shell: { openExternal: vi.fn() }
}))

import { buildMenuTemplate } from '../../src/main/menu'
import { ACTIONS, getAction, menuLabel, type ActionId } from '../../src/core/actions'
import { SUPPORTED_LOCALES, type Translator } from '../../src/core/i18n'
import { englishT } from '../../src/core/i18n/english'
import { translatorFor } from '../../src/core/i18n/all'

function build(isMac: boolean, t: Translator = englishT, isDev = false) {
  const emit = vi.fn()
  const openExternal = vi.fn()
  const showAbout = vi.fn()
  const template = buildMenuTemplate({ isMac, isDev, emit, openExternal, showAbout, t })
  return { template, emit, openExternal, showAbout }
}

function items(menu: MenuItemConstructorOptions | undefined): MenuItemConstructorOptions[] {
  return (menu?.submenu as MenuItemConstructorOptions[] | undefined) ?? []
}

function flatten(list: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return list.flatMap((i) => [i, ...flatten(items(i))])
}

const top = (template: MenuItemConstructorOptions[], label: string) =>
  template.find((m) => m.label === label)

const ids = new Set(ACTIONS.map((a) => a.id as string))

describe('application menu', () => {
  it('has the same top-level groups on every platform, plus the app menu on macOS', () => {
    expect(build(true).template.map((m) => m.label ?? m.role)).toEqual([
      'Tiger',
      'File',
      'Edit',
      'Request',
      'View',
      'Window',
      'Help'
    ])
    expect(build(false).template.map((m) => m.label ?? m.role)).toEqual([
      'File',
      'Edit',
      'Request',
      'View',
      'Window',
      'Help'
    ])
  })

  it('labels every action item exactly as the registry does', () => {
    for (const isMac of [true, false]) {
      for (const item of flatten(build(isMac).template)) {
        if (item.id && ids.has(item.id)) {
          expect(item.label, item.id).toBe(menuLabel(item.id as ActionId, englishT))
        }
      }
    }
  })

  it('wires every action item to the renderer by its registry id', () => {
    const { template, emit } = build(false)
    for (const item of flatten(template)) {
      if (!item.id || !ids.has(item.id) || !item.click) continue
      emit.mockClear()
      ;(item.click as () => void)()
      if (item.id === 'docs' || item.id === 'report-issue' || item.id === 'about') {
        expect(emit, item.id).not.toHaveBeenCalled()
      } else {
        expect(emit, item.id).toHaveBeenCalledWith(item.id)
      }
    }
  })

  it('shows renderer-owned shortcuts without registering them twice', () => {
    for (const item of flatten(build(true).template)) {
      if (!item.id || !ids.has(item.id) || item.accelerator === undefined) continue
      expect(item.registerAccelerator, item.id).toBe(!getAction(item.id as ActionId).rendererKey)
    }
  })

  it('File creates, opens, imports and exports; Settings is in File off macOS', () => {
    const fileIds = (isMac: boolean) =>
      items(top(build(isMac).template, 'File')).map((i) => i.id).filter(Boolean)
    expect(fileIds(false)).toEqual([
      'new-request',
      'new-websocket',
      'new-sse',
      'new-folder',
      'new-collection',
      'new-environment',
      'open-collection',
      'join-team',
      'team-sync',
      'import',
      'export',
      'settings',
      'close-tab'
    ])
    expect(fileIds(true)).not.toContain('settings')
    const appMenu = items(top(build(true).template, 'Tiger'))
    expect(appMenu.map((i) => i.id)).toContain('settings')
  })

  it('Request acts on the open request only', () => {
    const reqIds = items(top(build(false).template, 'Request')).map((i) => i.id).filter(Boolean)
    expect(reqIds).toEqual(['send', 'connect', 'save', 'duplicate-request', 'copy-curl', 'load-test', 'run-collection'])
  })

  it('View has sidebar, theme, zoom with Ctrl+= and the palette', () => {
    const view = flatten(items(top(build(false).template, 'View')))
    const byId = view.map((i) => i.id).filter(Boolean)
    expect(byId).toEqual(
      expect.arrayContaining(['command-palette', 'toggle-sidebar', 'theme-light', 'theme-dark', 'theme-system'])
    )
    const zoomIn = view.filter((i) => i.role === 'zoomIn')
    expect(zoomIn.map((i) => i.accelerator)).toEqual(['CmdOrCtrl+=', 'CmdOrCtrl+Plus'])
    expect(zoomIn[0].visible).not.toBe(false)
    expect(view.find((i) => i.role === 'zoomOut')?.accelerator).toBe('CmdOrCtrl+-')
    expect(view.find((i) => i.role === 'resetZoom')?.accelerator).toBe('CmdOrCtrl+0')
  })

  it('Help has getting started, shortcuts, docs and issue links; About off macOS', () => {
    const { template, openExternal, showAbout } = build(false)
    const help = items(top(template, 'Help'))
    expect(help.map((i) => i.id).filter(Boolean)).toEqual([
      'getting-started',
      'shortcuts',
      'docs',
      'report-issue',
      'check-update',
      'about'
    ])
    ;(help.find((i) => i.id === 'docs')!.click as () => void)()
    expect(openExternal).toHaveBeenCalledWith('https://jtaoufik.github.io/tiger/docs/getting-started/')
    ;(help.find((i) => i.id === 'report-issue')!.click as () => void)()
    expect(openExternal).toHaveBeenCalledWith('https://github.com/jtaoufik/tiger/issues')
    ;(help.find((i) => i.id === 'about')!.click as () => void)()
    expect(showAbout).toHaveBeenCalled()
    const macHelp = items(top(build(true).template, 'Help')).map((i) => i.id)
    expect(macHelp).not.toContain('about')
  })

  describe.each(SUPPORTED_LOCALES)('in %s', (locale) => {
    const t = translatorFor(locale)
    const all = (isMac: boolean) => flatten(build(isMac, t, true).template)

    it('labels every item, including Electron roles, in the language', () => {
      for (const isMac of [true, false]) {
        for (const item of all(isMac)) {
          if (item.type === 'separator') continue
          expect(typeof item.label, `${locale} ${item.role ?? item.id}`).toBe('string')
          expect(item.label!.length, `${locale} ${item.role ?? item.id}`).toBeGreaterThan(0)
          // A raw key means the catalog lookup missed.
          expect(item.label, `${locale} ${item.role ?? item.id}`).not.toMatch(/^(menu|actions)\./)
        }
      }
    })

    it('uses the translated registry labels for actions', () => {
      for (const item of all(false)) {
        if (item.id && ids.has(item.id)) expect(item.label).toBe(menuLabel(item.id as ActionId, t))
      }
      const topLabels = build(false, t).template.map((m) => m.label)
      expect(topLabels).toEqual(
        ['menu.file', 'menu.edit', 'menu.request', 'menu.view', 'menu.window', 'menu.help'].map((k) =>
          t(k as Parameters<Translator>[0])
        )
      )
    })

    it('keeps ids, roles and accelerators identical to English', () => {
      const shape = (tr: Translator) =>
        flatten(build(true, tr, true).template).map((i) => [i.id, i.role, i.accelerator, i.type])
      expect(shape(t)).toEqual(shape(englishT))
    })
  })
})
