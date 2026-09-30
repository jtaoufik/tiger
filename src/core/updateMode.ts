/**
 * Which update path a running Tiger uses. Pure (no Electron import) so the
 * decision is unit-tested; src/main/autoUpdate.ts feeds it the real process
 * facts.
 *
 * - auto:   electron-updater installs new releases in place (mac zip/dmg
 *           installs, the Windows NSIS installer, Linux AppImage).
 * - manual: Tiger only points at the website download page (dev, .deb,
 *           tar.gz, the Windows portable exe and zip), or stays silent
 *           (Microsoft Store builds: the Store owns updates there).
 */

export type UpdateMode = 'auto' | 'manual'

export type ManualReason =
  | 'dev'
  | 'store'
  | 'portable'
  | 'linux-package'
  | 'unsupported-platform'

export type UpdateModeInfo = { mode: 'auto' } | { mode: 'manual'; reason: ManualReason }

export interface UpdateModeInput {
  isPackaged: boolean
  platform: string
  /** process.windowsStore: true inside an MSIX/appx (Microsoft Store) install. */
  windowsStore?: boolean
  env: Record<string, string | undefined>
  /**
   * Windows only: true when "Uninstall Tiger.exe" sits next to Tiger.exe,
   * i.e. the app was installed by the NSIS Setup. The portable exe and the
   * zip have no uninstaller, and electron-updater would otherwise "update"
   * them by running the NSIS installer into a different folder.
   */
  nsisInstalled?: boolean
}

export function resolveUpdateMode(input: UpdateModeInput): UpdateModeInfo {
  if (!input.isPackaged) return { mode: 'manual', reason: 'dev' }
  switch (input.platform) {
    case 'darwin':
      return { mode: 'auto' }
    case 'win32':
      if (input.windowsStore) return { mode: 'manual', reason: 'store' }
      // electron-builder's portable launcher exports this to the app it unpacks.
      if (input.env.PORTABLE_EXECUTABLE_FILE) return { mode: 'manual', reason: 'portable' }
      if (!input.nsisInstalled) return { mode: 'manual', reason: 'portable' }
      return { mode: 'auto' }
    case 'linux':
      // The AppImage runtime sets APPIMAGE to the image's own path; a .deb or
      // tar.gz install never has it, and only the AppImage updates itself.
      return input.env.APPIMAGE ? { mode: 'auto' } : { mode: 'manual', reason: 'linux-package' }
    default:
      return { mode: 'manual', reason: 'unsupported-platform' }
  }
}
