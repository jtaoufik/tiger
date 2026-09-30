/**
 * Renderer side of i18n: the active translator, a hook that re-renders on a
 * language switch, and the <html lang dir> attributes.
 *
 * - In components: `const t = useT()` then `t('key', { var })`. Always use the
 *   hook in a component, so a live language switch re-renders it.
 * - Outside React (toasts, announce(), helpers called from handlers):
 *   `t('key')` reads the active translator at call time.
 *
 * Every catalog, English included, loads on demand (see @core/i18n/load) so
 * the startup chunk stays small; main.tsx awaits setLocale() before the first
 * render, and the test setup loads English once for all suites.
 */
import { useSyncExternalStore } from 'react'
import {
  createTranslator,
  isLocale,
  matchLocale,
  textDirection,
  type Locale,
  type LocaleCatalog,
  type MessageKey,
  type Translator,
  type Vars
} from '@core/i18n'
import { loadCatalog, loadEnglish } from '@core/i18n/load'

/** Until English is loaded, keys render as themselves (never seen in the app). */
let current: Translator = createTranslator('en', undefined, {})
let english: LocaleCatalog | undefined
let seq = 0
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function snapshot(): Translator {
  return current
}

/** The active translator; re-renders the component when the language changes. */
export function useT(): Translator {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** Translate with the active language, for code outside React render. */
export function t(key: MessageKey, vars?: Vars): string {
  return current(key, vars)
}

export function currentTranslator(): Translator {
  return current
}

export function currentLocale(): Locale {
  return current.locale
}

/** <html lang="ar" dir="rtl">: drives CSS logical properties and bidi. */
export function applyDocumentLocale(locale: Locale, doc: Document = document): void {
  doc.documentElement.lang = locale
  doc.documentElement.dir = textDirection(locale)
}

/**
 * Switch the UI language: load the catalog (if not English), then swap the
 * translator and notify every useT() consumer. A slower earlier switch can
 * never win over a later one.
 */
export async function setLocale(locale: Locale): Promise<void> {
  const mine = ++seq
  const [source, catalog] = await Promise.all([english ?? loadEnglish(), loadCatalog(locale)])
  english = source
  if (mine !== seq) return
  current = createTranslator(locale, catalog, source)
  if (typeof document !== 'undefined') applyDocumentLocale(locale)
  for (const listener of listeners) listener()
}

/** The language for the first frame: what main resolved, else the browser's. */
export function initialLocale(): Locale {
  const fromMain = window.tiger?.initialLocale
  if (isLocale(fromMain)) return fromMain
  return matchLocale(typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [])
}

/**
 * Follow language changes pushed by main (Settings > Language, in this or
 * another window). Returns an unsubscribe function.
 */
export function followMainLocale(): () => void {
  return window.tiger?.onLocale?.((locale) => void setLocale(locale)) ?? (() => {})
}
