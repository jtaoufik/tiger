import { beforeEach, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({
  chromium: 'en-US',
  preferred: ['en-US'] as string[],
  langSwitch: false,
  sent: [] as unknown[]
}))

vi.mock('electron', () => ({
  app: {
    getLocale: () => env.chromium,
    getPreferredSystemLanguages: () => env.preferred,
    commandLine: { hasSwitch: (name: string) => name === 'lang' && env.langSwitch }
  },
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: (...a: unknown[]) => env.sent.push(a) } }]
  }
}))

import {
  broadcastLocale,
  mainLocale,
  mainT,
  resolveAppLocale,
  setMainLocale,
  systemLanguages
} from '../../src/main/i18n'

describe('main-process language', () => {
  beforeEach(() => {
    env.chromium = 'en-US'
    env.preferred = ['en-US']
    env.langSwitch = false
    env.sent = []
    setMainLocale('en')
  })

  it('follows the OS preference list for "System default"', () => {
    env.preferred = ['es-MX', 'en-US']
    expect(resolveAppLocale('system')).toBe('es')
    env.preferred = ['zh-Hans-CN']
    expect(resolveAppLocale(undefined)).toBe('zh-CN')
    env.preferred = ['de-DE', 'fr-CA']
    expect(resolveAppLocale('system')).toBe('fr')
    env.preferred = ['de-DE']
    env.chromium = 'de'
    expect(resolveAppLocale('system')).toBe('en')
  })

  it('lets a --lang switch win over the OS list', () => {
    env.preferred = ['fr-FR', 'en-US']
    env.chromium = 'ar'
    env.langSwitch = true
    expect(systemLanguages()[0]).toBe('ar')
    expect(resolveAppLocale('system')).toBe('ar')
    env.langSwitch = false
    expect(resolveAppLocale('system')).toBe('fr')
  })

  it('an explicit Language setting wins over everything', () => {
    env.preferred = ['fr-FR']
    expect(resolveAppLocale('hi')).toBe('hi')
  })

  it('switches the synchronous translator and reports whether it changed', () => {
    expect(mainT('menu.file')).toBe('File')
    expect(setMainLocale('fr')).toBe(true)
    expect(setMainLocale('fr')).toBe(false)
    expect(mainLocale()).toBe('fr')
    expect(mainT('menu.file')).toBe('Fichier')
  })

  it('pushes a language change to every window', () => {
    broadcastLocale('ar')
    expect(env.sent).toEqual([['tiger:locale', 'ar']])
  })
})
