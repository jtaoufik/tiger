import { describe, expect, it } from 'vitest'
import { resolveUpdateMode, type UpdateModeInput } from '../../src/core/updateMode'

const base: UpdateModeInput = { isPackaged: true, platform: 'darwin', env: {} }

describe('resolveUpdateMode (which updater path)', () => {
  it('dev (unpackaged) never auto-updates, on any platform', () => {
    for (const platform of ['darwin', 'win32', 'linux']) {
      expect(
        resolveUpdateMode({
          ...base,
          platform,
          isPackaged: false,
          nsisInstalled: true,
          env: { APPIMAGE: '/a' }
        })
      ).toEqual({ mode: 'manual', reason: 'dev' })
    }
  })

  it('packaged macOS updates in place (Squirrel.Mac via the release zip)', () => {
    expect(resolveUpdateMode(base)).toEqual({ mode: 'auto' })
  })

  it('Windows NSIS install auto-updates', () => {
    expect(resolveUpdateMode({ ...base, platform: 'win32', nsisInstalled: true })).toEqual({
      mode: 'auto'
    })
  })

  it('Microsoft Store build is left to the Store, even with an uninstaller present', () => {
    expect(
      resolveUpdateMode({ ...base, platform: 'win32', windowsStore: true, nsisInstalled: true })
    ).toEqual({ mode: 'manual', reason: 'store' })
  })

  it('Windows portable exe (PORTABLE_EXECUTABLE_FILE set) falls back to the website', () => {
    expect(
      resolveUpdateMode({
        ...base,
        platform: 'win32',
        nsisInstalled: true,
        env: { PORTABLE_EXECUTABLE_FILE: 'C:\\Tiger-Portable.exe' }
      })
    ).toEqual({ mode: 'manual', reason: 'portable' })
  })

  it('Windows zip (no NSIS uninstaller next to the exe) falls back to the website', () => {
    expect(resolveUpdateMode({ ...base, platform: 'win32', nsisInstalled: false })).toEqual({
      mode: 'manual',
      reason: 'portable'
    })
  })

  it('Linux AppImage (APPIMAGE set) auto-updates', () => {
    expect(
      resolveUpdateMode({ ...base, platform: 'linux', env: { APPIMAGE: '/home/u/Tiger.AppImage' } })
    ).toEqual({ mode: 'auto' })
  })

  it('Linux .deb / tar.gz (no APPIMAGE) falls back to the website', () => {
    expect(resolveUpdateMode({ ...base, platform: 'linux', env: {} })).toEqual({
      mode: 'manual',
      reason: 'linux-package'
    })
    expect(resolveUpdateMode({ ...base, platform: 'linux', env: { APPIMAGE: '' } })).toEqual({
      mode: 'manual',
      reason: 'linux-package'
    })
  })

  it('unknown platforms stay manual', () => {
    expect(resolveUpdateMode({ ...base, platform: 'freebsd' })).toEqual({
      mode: 'manual',
      reason: 'unsupported-platform'
    })
  })
})
