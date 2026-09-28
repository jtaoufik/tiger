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
import {
  accelerator,
  docsUrl,
  getAction,
  menuLabel,
  REPO_URL,
  type ActionId
} from '../core/actions'

/** Everything the menu needs from the outside world, injectable for tests. */
export interface MenuDeps {
  isMac: boolean
  isDev: boolean
  /** Forward an action id to the focused renderer. */
  emit: (id: ActionId) => void
  openExternal: (url: string) => void
  showAbout: () => void
}

/**
 * The application menu, built from the shared action registry so every label
 * and shortcut matches what the app shows in its palette, tooltips, context
 * menus and shortcuts overlay.
 */
export function buildMenuTemplate(deps: MenuDeps): MenuItemConstructorOptions[] {
  const { isMac, isDev, emit } = deps
  const sep: MenuItemConstructorOptions = { type: 'separator' }

  /** A menu item that triggers a renderer action. Actions whose shortcut the
   * renderer handles itself show the accelerator without registering it, so
   * the key never fires twice. */
  const item = (id: ActionId): MenuItemConstructorOptions => ({
    id,
    label: menuLabel(id),
    accelerator: accelerator(id),
    registerAccelerator: !getAction(id).rendererKey,
    click: () => emit(id)
  })

  const template: MenuItemConstructorOptions[] = []

  if (isMac) {
    template.push({
      label: 'Tiger',
      submenu: [
        { role: 'about', label: 'About Tiger' },
        item('check-update'),
        sep,
        // macOS keeps Settings in the app menu; elsewhere it closes the File menu.
        item('settings'),
        sep,
        { role: 'services' },
        sep,
        { role: 'hide', label: 'Hide Tiger' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        sep,
        { role: 'quit', label: 'Quit Tiger' }
      ]
    })
  }

  template.push({
    label: 'File',
    submenu: [
      item('new-request'),
      item('new-folder'),
      item('new-collection'),
      item('new-environment'),
      sep,
      item('open-collection'),
      sep,
      item('import'),
      item('export'),
      sep,
      ...(isMac ? [] : [item('settings'), sep]),
      // The menu owns Cmd/Ctrl+W: it closes the active tab, not the window.
      item('close-tab'),
      isMac
        ? { role: 'close', label: 'Close window', accelerator: 'Shift+CmdOrCtrl+W' }
        : { role: 'quit', label: 'Exit' }
    ]
  })

  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      sep,
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(isMac
        ? ([{ role: 'pasteAndMatchStyle' }, { role: 'delete' }, { role: 'selectAll' }] as const)
        : ([{ role: 'delete' }, sep, { role: 'selectAll' }] as const))
    ]
  })

  template.push({
    label: 'Request',
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
    label: 'View',
    submenu: [
      item('command-palette'),
      item('toggle-sidebar'),
      sep,
      item('environments'),
      item('history'),
      sep,
      {
        label: 'Theme',
        submenu: [item('theme-system'), item('theme-light'), item('theme-dark')]
      },
      sep,
      // Ctrl+= is what people press on Windows and Linux; the stock role only
      // listens to Ctrl+Plus (Shift+= on most layouts). Keep both.
      { role: 'zoomIn', label: menuLabel('zoom-in'), accelerator: accelerator('zoom-in') },
      { role: 'zoomIn', label: menuLabel('zoom-in'), accelerator: 'CmdOrCtrl+Plus', visible: false },
      { role: 'zoomOut', label: menuLabel('zoom-out'), accelerator: accelerator('zoom-out') },
      { role: 'resetZoom', label: menuLabel('zoom-reset'), accelerator: accelerator('zoom-reset') },
      sep,
      { role: 'togglefullscreen' },
      ...(isDev
        ? ([sep, { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }] as const)
        : [])
    ]
  })

  template.push({
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      ...(isMac ? ([sep, { role: 'front' }] as const) : ([{ role: 'close' }] as const))
    ]
  })

  template.push({
    role: 'help',
    submenu: [
      item('getting-started'),
      item('shortcuts'),
      {
        id: 'docs',
        label: menuLabel('docs'),
        click: () => deps.openExternal(docsUrl('getting-started'))
      },
      sep,
      {
        id: 'report-issue',
        label: menuLabel('report-issue'),
        click: () => deps.openExternal(`${REPO_URL}/issues`)
      },
      // macOS has these in the app menu.
      ...(isMac
        ? []
        : [
            sep,
            item('check-update'),
            { id: 'about', label: menuLabel('about'), click: () => deps.showAbout() }
          ])
    ]
  })

  return template
}

/** The window a menu action should target: whichever has focus, else the first. */
function targetWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
}

/** Install Tiger's application menu. Replaces Electron's stock default menu. */
export function buildAppMenu(): void {
  const template = buildMenuTemplate({
    isMac: process.platform === 'darwin',
    isDev: !app.isPackaged,
    // Reuses the shortcut channel; App.tsx dispatches by action id.
    emit: (id) => targetWindow()?.webContents.send('tiger:shortcut', id),
    openExternal: (url) => void shell.openExternal(url),
    showAbout: () => {
      const win = targetWindow()
      const options = {
        type: 'info' as const,
        title: 'About Tiger',
        message: 'Tiger',
        detail: `Version ${app.getVersion()}\n${REPO_URL}`,
        icon: nativeImage.createFromPath(join(__dirname, '../../build/icon.png'))
      }
      if (win) dialog.showMessageBox(win, options)
      else dialog.showMessageBox(options)
    }
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
