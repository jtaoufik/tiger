/**
 * Main-process side of i18n: which language the app speaks, and a
 * synchronous translator for the native menu, dialogs and messages built here.
 *
 * The language is the Settings choice, or with "System default" the best
 * match for the OS preference list. A `--lang=xx` switch (Chromium's own,
 * used by the e2e suite and by people who want to override the OS) wins over
 * the OS list, because Chromium then reports it through app.getLocale().
 */
import { app, BrowserWindow } from 'electron'
import { translatorFor } from '../core/i18n/all'
import {
  resolveLanguage,
  type LanguageChoice,
  type Locale,
  type MessageKey,
  type Translator,
  type Vars
} from '../core/i18n'

let current: Translator = translatorFor('en')

/** The OS language preferences, most preferred first. */
export function systemLanguages(): string[] {
  let preferred: string[] = []
  try {
    preferred = app.getPreferredSystemLanguages()
  } catch {
    /* not available before ready on some platforms */
  }
  const chromium = app.getLocale()
  return app.commandLine.hasSwitch('lang') ? [chromium, ...preferred] : [...preferred, chromium]
}

export function resolveAppLocale(choice: LanguageChoice | undefined): Locale {
  return resolveLanguage(choice, systemLanguages())
}

/** Switch the main-process language. Returns true when it changed. */
export function setMainLocale(locale: Locale): boolean {
  if (current.locale === locale) return false
  current = translatorFor(locale)
  return true
}

export function mainLocale(): Locale {
  return current.locale
}

export function mainTranslator(): Translator {
  return current
}

/** Translate in the app's current language (main process only). */
export function mainT(key: MessageKey, vars?: Vars): string {
  return current(key, vars)
}

/** Tell every window the language changed, so the UI switches live. */
export function broadcastLocale(locale: Locale): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('tiger:locale', locale)
  }
}
