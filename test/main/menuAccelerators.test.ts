/**
 * Windows/Linux: which menu item does each shortcut trigger?
 *
 * Reproduces Electron 34's accelerator table exactly:
 *  - shell/browser/ui/accelerator_util.cc (v34.5.8) GenerateAcceleratorTable():
 *      walks the menu in order, uses GetAcceleratorAtWithParams(i, /*use_default*\/ true)
 *      and stores `(*table)[accelerator] = item;`  -> the LAST item wins.
 *  - lib/browser/api/menu.ts _getAcceleratorForCommandId(): item.accelerator ?? role default.
 *  - lib/browser/api/menu-item-roles.ts (extracted from the Electron 34.5.8 binary):
 *      close: { label: 'Close', accelerator: 'CommandOrControl+W', windowMethod: w => w.close() }
 *  - menu-item.ts: registerAccelerator defaults to shouldRegisterAccelerator(role) = true for close.
 * RootView::SetMenu registers this table with the FocusManager on Windows; the
 * renderer deliberately does not handle Ctrl+W in Electron (App.tsx:1242), so
 * the key reaches the table.
 */
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
import { englishT } from '../../src/core/i18n/english'

/** Role default accelerators on win32, copied from Electron 34.5.8 menu-item-roles.ts. */
const ROLE_DEFAULTS_WIN32: Record<string, { accelerator?: string; registerAccelerator?: boolean }> = {
  close: { accelerator: 'CommandOrControl+W' },
  copy: { accelerator: 'CommandOrControl+C', registerAccelerator: false },
  cut: { accelerator: 'CommandOrControl+X', registerAccelerator: false },
  paste: { accelerator: 'CommandOrControl+V', registerAccelerator: false },
  minimize: { accelerator: 'CommandOrControl+M' },
  redo: { accelerator: 'Control+Y' },
  undo: { accelerator: 'CommandOrControl+Z' },
  selectall: { accelerator: 'CommandOrControl+A' },
  togglefullscreen: { accelerator: 'F11' },
  zoomin: { accelerator: 'CommandOrControl+Plus' },
  zoomout: { accelerator: 'CommandOrControl+-' },
  resetzoom: { accelerator: 'CommandOrControl+0' }
}

const norm = (a: string) =>
  a
    .split('+')
    .map((p) => (/^(CmdOrCtrl|CommandOrControl|Ctrl|Control)$/i.test(p) ? 'Ctrl' : p.toUpperCase()))
    .join('+')

function acceleratorTable(template: MenuItemConstructorOptions[]) {
  const table = new Map<string, string>()
  const walk = (items: MenuItemConstructorOptions[]) => {
    for (const it of items) {
      if (Array.isArray(it.submenu)) {
        walk(it.submenu as MenuItemConstructorOptions[])
        continue
      }
      const role = it.role?.toLowerCase()
      const def = role ? ROLE_DEFAULTS_WIN32[role] : undefined
      const register = it.registerAccelerator ?? def?.registerAccelerator ?? true
      const acc = it.accelerator ?? def?.accelerator
      if (!register || !acc) continue
      table.set(norm(acc as string), it.id ?? `role:${role}`) // (*table)[accelerator] = item
    }
  }
  walk(template)
  return table
}

describe('Windows menu accelerators', () => {
  it('Ctrl+W closes the active TAB (the shortcut Tiger documents), not the window', () => {
    const template = buildMenuTemplate({
      isMac: false,
      isDev: false,
      emit: vi.fn(),
      openExternal: vi.fn(),
      showAbout: vi.fn(),
      t: englishT
    })
    const table = acceleratorTable(template)
    // Window > Close (role default CommandOrControl+W) is registered after
    // File > Close Tab and used to overwrite it.
    expect(table.get('Ctrl+W')).toBe('close-tab')
    expect(table.get('Ctrl+SHIFT+W')).toBe('role:close')
  })

  it('gives no two menu items the same shortcut', () => {
    const items: string[] = []
    const walk = (list: MenuItemConstructorOptions[]) => {
      for (const it of list) {
        if (Array.isArray(it.submenu)) walk(it.submenu as MenuItemConstructorOptions[])
        else {
          const role = it.role?.toLowerCase()
          const def = role ? ROLE_DEFAULTS_WIN32[role] : undefined
          const acc = it.accelerator ?? def?.accelerator
          if (acc && (it.registerAccelerator ?? def?.registerAccelerator ?? true)) items.push(norm(acc as string))
        }
      }
    }
    walk(
      buildMenuTemplate({ isMac: false, isDev: false, emit: vi.fn(), openExternal: vi.fn(), showAbout: vi.fn(), t: englishT })
    )
    expect(items.filter((a, i) => items.indexOf(a) !== i)).toEqual([])
  })
})
