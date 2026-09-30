import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  nativeImage,
  shell,
  type MenuItemConstructorOptions
} from 'electron'
import { join } from 'node:path'
import { targetAppWindow } from './windows'
import {
  accelerator,
  docsUrl,
  getAction,
  menuLabel,
  REPO_URL,
  type ActionId
} from '../core/actions'
import type { Translator } from '../core/i18n'
import { mainTranslator } from './i18n'

/** Everything the menu needs from the outside world, injectable for tests. */
export interface MenuDeps {
  isMac: boolean
  isDev: boolean
  /** Forward an action id to the focused renderer. */
  emit: (id: ActionId) => void
  openExternal: (url: string) => void
  showAbout: () => void
  /** The app's current language; the menu is rebuilt when it changes. */
  t: Translator
}

/**
 * The application menu, built from the shared action registry so every label
 * and shortcut matches what the app shows in its palette, tooltips, context
 * menus and shortcuts overlay.
 */
export function buildMenuTemplate(deps: MenuDeps): MenuItemConstructorOptions[] {
  const { isMac, isDev, emit, t } = deps
  const sep: MenuItemConstructorOptions = { type: 'separator' }

  /** A menu item that triggers a renderer action. Actions whose shortcut the
   * renderer handles itself show the accelerator without registering it, so
   * the key never fires twice. */
  const item = (id: ActionId): MenuItemConstructorOptions => ({
    id,
    label: menuLabel(id, t),
    accelerator: accelerator(id),
    registerAccelerator: !getAction(id).rendererKey,
    click: () => emit(id)
  })

  const template: MenuItemConstructorOptions[] = []

  if (isMac) {
    template.push({
      label: t('menu.app'),
      submenu: [
        { role: 'about', label: t('menu.about') },
        item('check-update'),
        sep,
        // macOS keeps Settings in the app menu; elsewhere it closes the File menu.
        item('settings'),
        sep,
        { role: 'services', label: t('menu.services') },
        sep,
        { role: 'hide', label: t('menu.hide') },
        { role: 'hideOthers', label: t('menu.hideOthers') },
        { role: 'unhide', label: t('menu.unhide') },
        sep,
        { role: 'quit', label: t('menu.quit') }
      ]
    })
  }

  template.push({
    label: t('menu.file'),
    submenu: [
      item('new-request'),
      item('new-folder'),
      item('new-collection'),
      item('new-environment'),
      sep,
      item('open-collection'),
      item('join-team'),
      item('team-sync'),
      sep,
      item('import'),
      item('export'),
      sep,
      ...(isMac ? [] : [item('settings'), sep]),
      // The menu owns Cmd/Ctrl+W: it closes the active tab, not the window.
      item('close-tab'),
      isMac
        ? { role: 'close', label: t('menu.closeWindow'), accelerator: 'Shift+CmdOrCtrl+W' }
        : { role: 'quit', label: t('menu.exit') }
    ]
  })

  template.push({
    label: t('menu.edit'),
    submenu: [
      { role: 'undo', label: t('menu.undo') },
      { role: 'redo', label: t('menu.redo') },
      sep,
      { role: 'cut', label: t('menu.cut') },
      { role: 'copy', label: t('menu.copy') },
      { role: 'paste', label: t('menu.paste') },
      ...(isMac
        ? ([
            { role: 'pasteAndMatchStyle', label: t('menu.pasteAndMatchStyle') },
            { role: 'delete', label: t('menu.delete') },
            { role: 'selectAll', label: t('menu.selectAll') }
          ] as const)
        : ([
            { role: 'delete', label: t('menu.delete') },
            sep,
            { role: 'selectAll', label: t('menu.selectAll') }
          ] as const))
    ]
  })

  template.push({
    label: t('menu.request'),
    submenu: [
      item('send'),
      item('save'),
      sep,
      item('duplicate-request'),
      item('copy-curl'),
      sep,
      item('load-test'),
      item('run-collection')
    ]
  })

  template.push({
    label: t('menu.view'),
    submenu: [
      item('command-palette'),
      item('toggle-sidebar'),
      sep,
      item('environments'),
      item('history'),
      sep,
      {
        label: t('menu.theme'),
        submenu: [item('theme-system'), item('theme-light'), item('theme-dark')]
      },
      sep,
      // Ctrl+= is what people press on Windows and Linux; the stock role only
      // listens to Ctrl+Plus (Shift+= on most layouts). Keep both.
      { role: 'zoomIn', label: menuLabel('zoom-in', t), accelerator: accelerator('zoom-in') },
      { role: 'zoomIn', label: menuLabel('zoom-in', t), accelerator: 'CmdOrCtrl+Plus', visible: false },
      { role: 'zoomOut', label: menuLabel('zoom-out', t), accelerator: accelerator('zoom-out') },
      { role: 'resetZoom', label: menuLabel('zoom-reset', t), accelerator: accelerator('zoom-reset') },
      sep,
      { role: 'togglefullscreen', label: t('menu.toggleFullScreen') },
      ...(isDev
        ? ([
            sep,
            { role: 'reload', label: t('menu.reload') },
            { role: 'forceReload', label: t('menu.forceReload') },
            { role: 'toggleDevTools', label: t('menu.toggleDevTools') }
          ] as const)
        : [])
    ]
  })

  template.push({
    label: t('menu.window'),
    submenu: [
      { role: 'minimize', label: t('menu.minimize') },
      { role: 'zoom', label: t('menu.zoomWindow') },
      ...(isMac
        ? ([sep, { role: 'front', label: t('menu.front') }] as const)
        : ([{ role: 'close', label: t('menu.close') }] as const))
    ]
  })

  template.push({
    role: 'help',
    label: t('menu.help'),
    submenu: [
      item('getting-started'),
      item('shortcuts'),
      {
        id: 'docs',
        label: menuLabel('docs', t),
        click: () => deps.openExternal(docsUrl('getting-started'))
      },
      sep,
      {
        id: 'report-issue',
        label: menuLabel('report-issue', t),
        click: () => deps.openExternal(`${REPO_URL}/issues`)
      },
      // macOS has these in the app menu.
      ...(isMac
        ? []
        : [
            sep,
            item('check-update'),
            { id: 'about', label: menuLabel('about', t), click: () => deps.showAbout() }
          ])
    ]
  })

  return template
}

/** The window a menu action should target: whichever has focus, else the first. */
function targetWindow(): BrowserWindow | null {
  return targetAppWindow() ?? null
}

/**
 * Install Tiger's application menu in the current language. Replaces
 * Electron's stock default menu; called again whenever the language changes.
 */
export function buildAppMenu(): void {
  const t = mainTranslator()
  const template = buildMenuTemplate({
    t,
    isMac: process.platform === 'darwin',
    isDev: !app.isPackaged,
    // Reuses the shortcut channel; App.tsx dispatches by action id.
    emit: (id) => targetWindow()?.webContents.send('tiger:shortcut', id),
    openExternal: (url) => void shell.openExternal(url),
    showAbout: () => {
      const win = targetWindow()
      const options = {
        type: 'info' as const,
        title: t('menu.about'),
        message: t('menu.app'),
        detail: `${t('menu.aboutDetail', { version: app.getVersion() })}\n${REPO_URL}`,
        icon: nativeImage.createFromPath(join(__dirname, '../../build/icon.png'))
      }
      if (win) dialog.showMessageBox(win, options)
      else dialog.showMessageBox(options)
    }
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
