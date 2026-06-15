import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  shell,
  type MenuItemConstructorOptions
} from 'electron'

const REPO = 'https://github.com/jtaoufik/tiger'

/** The window a menu action should target: whichever has focus, else the first. */
function targetWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
}

/** Forward a menu action to the renderer, reusing the shortcut channel. */
function emit(name: string): void {
  targetWindow()?.webContents.send('tiger:shortcut', name)
}

/**
 * A menu item that triggers a renderer action. `register` controls whether the OS
 * binds the accelerator: actions the renderer already handles through its own
 * keydown listener pass `register: false`, so the shortcut still shows next to the
 * label without firing the action twice.
 */
function action(
  label: string,
  accelerator: string | undefined,
  name: string,
  register = true
): MenuItemConstructorOptions {
  return { label, accelerator, registerAccelerator: register, click: () => emit(name) }
}

/** Install Tiger's application menu. Replaces Electron's stock default menu. */
export function buildAppMenu(): void {
  const isMac = process.platform === 'darwin'
  const isDev = !app.isPackaged
  const template: MenuItemConstructorOptions[] = []

  if (isMac) {
    template.push({
      label: 'Tiger',
      submenu: [
        { role: 'about', label: 'About Tiger' },
        action('Check for Updates…', undefined, 'check-update'),
        { type: 'separator' },
        action('Settings…', 'CmdOrCtrl+,', 'settings'),
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: 'Hide Tiger' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit Tiger' }
      ]
    })
  }

  template.push({
    label: 'File',
    submenu: [
      // The renderer owns ⌘T, so register: false avoids a double trigger.
      action('New Request', 'CmdOrCtrl+T', 'new-request', false),
      action('New Collection…', 'CmdOrCtrl+N', 'new-collection'),
      action('Open Collection…', 'CmdOrCtrl+O', 'open-collection'),
      { type: 'separator' },
      action('Import / Export…', undefined, 'import-export'),
      { type: 'separator' },
      // The menu owns ⌘W in the desktop app; it closes the active tab, not the window.
      action('Close Tab', 'CmdOrCtrl+W', 'close-tab'),
      isMac
        ? { role: 'close', label: 'Close Window', accelerator: 'Shift+CmdOrCtrl+W' }
        : { role: 'quit', label: 'Exit' }
    ]
  })

  const editMac: MenuItemConstructorOptions[] = [
    { role: 'pasteAndMatchStyle' },
    { role: 'delete' },
    { role: 'selectAll' }
  ]
  const editOther: MenuItemConstructorOptions[] = [
    { role: 'delete' },
    { type: 'separator' },
    { role: 'selectAll' }
  ]
  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(isMac ? editMac : editOther)
    ]
  })

  template.push({
    label: 'Request',
    submenu: [
      action('Send', 'CmdOrCtrl+Return', 'send', false),
      action('Save', 'CmdOrCtrl+S', 'save', false),
      { type: 'separator' },
      action('Command Palette…', 'CmdOrCtrl+K', 'command-palette', false),
      action('Environments…', undefined, 'environments'),
      action('History…', undefined, 'history')
    ]
  })

  const devView: MenuItemConstructorOptions[] = [
    { role: 'reload' },
    { role: 'forceReload' },
    { role: 'toggleDevTools' },
    { type: 'separator' }
  ]
  template.push({
    label: 'View',
    submenu: [
      ...(isDev ? devView : []),
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  })

  const windowMac: MenuItemConstructorOptions[] = [{ type: 'separator' }, { role: 'front' }]
  const windowOther: MenuItemConstructorOptions[] = [{ role: 'close' }]
  template.push({
    label: 'Window',
    submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? windowMac : windowOther)]
  })

  const aboutOther: MenuItemConstructorOptions[] = [
    { type: 'separator' },
    {
      label: 'About Tiger',
      click: () =>
        dialog.showMessageBox({
          type: 'info',
          title: 'About Tiger',
          message: 'Tiger',
          detail: `Version ${app.getVersion()}`
        })
    }
  ]
  template.push({
    role: 'help',
    submenu: [
      action('Keyboard Shortcuts', undefined, 'shortcuts'),
      { type: 'separator' },
      { label: 'Tiger on GitHub', click: () => shell.openExternal(REPO) },
      { label: 'Report an Issue', click: () => shell.openExternal(`${REPO}/issues`) },
      ...(isMac ? [] : aboutOther)
    ]
  })

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
