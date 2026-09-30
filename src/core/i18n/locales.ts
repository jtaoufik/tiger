/**
 * The languages Tiger ships, and how a system language maps onto them.
 * Pure: no DOM, no Node, no Electron. Used by main (menu, dialogs, the
 * default language) and by the renderer (the Settings picker, <html dir>).
 */

export const SUPPORTED_LOCALES = ['en', 'zh-CN', 'hi', 'es', 'fr', 'ar'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

/** English is the source language and the fallback for any missing key. */
export const DEFAULT_LOCALE: Locale = 'en'

/** What the Language setting stores: a locale, or follow the system. */
export type LanguageChoice = Locale | 'system'

/** Each language in its own name, as the Language picker shows it. */
export const LOCALE_NATIVE_NAMES: Record<Locale, string> = {
  en: 'English',
  'zh-CN': '中文',
  hi: 'हिन्दी',
  es: 'Español',
  fr: 'Français',
  ar: 'العربية'
}

const RTL: ReadonlySet<Locale> = new Set<Locale>(['ar'])

export function isRtl(locale: Locale): boolean {
  return RTL.has(locale)
}

export function textDirection(locale: Locale): 'rtl' | 'ltr' {
  return isRtl(locale) ? 'rtl' : 'ltr'
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

export function isLanguageChoice(value: unknown): value is LanguageChoice {
  return value === 'system' || isLocale(value)
}

/**
 * The supported locale for one BCP 47 tag, or null when none fits.
 * Region variants fold onto the base language (es-MX -> es, fr-CA -> fr).
 * Chinese maps only when the tag is Simplified (zh, zh-CN, zh-SG, zh-Hans,
 * zh-Hans-HK); Traditional (zh-TW, zh-HK, zh-Hant) is not offered as
 * Simplified and falls through to the next preference.
 */
export function matchOne(tag: string): Locale | null {
  const clean = tag.trim().replace(/_/g, '-')
  if (!clean) return null
  const parts = clean.split('-')
  const lang = parts[0].toLowerCase()
  const rest = parts.slice(1).map((p) => p.toLowerCase())
  if (lang === 'zh') {
    if (rest.includes('hant')) return null
    if (rest.includes('hans')) return 'zh-CN'
    if (rest.some((p) => p === 'tw' || p === 'hk' || p === 'mo')) return null
    return 'zh-CN'
  }
  for (const locale of SUPPORTED_LOCALES) {
    if (locale.toLowerCase() === lang) return locale
  }
  return null
}

/**
 * Best supported locale for an ordered list of preferred languages (the OS
 * preference list, most preferred first). The first tag that maps wins; with
 * no match at all, English.
 */
export function matchLocale(preferred: readonly (string | null | undefined)[]): Locale {
  for (const tag of preferred) {
    if (!tag) continue
    const hit = matchOne(tag)
    if (hit) return hit
  }
  return DEFAULT_LOCALE
}

/** The locale a stored Language choice resolves to on this machine. */
export function resolveLanguage(
  choice: LanguageChoice | undefined,
  preferred: readonly (string | null | undefined)[]
): Locale {
  if (choice && choice !== 'system' && isLocale(choice)) return choice
  return matchLocale(preferred)
}
