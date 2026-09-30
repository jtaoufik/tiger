/**
 * A tiny typed translator. Pure: Intl only, no DOM, no Node.
 *
 * Why not i18next / FormatJS: the catalogs are plain TS objects, the only
 * features needed are {var} interpolation, CLDR plural categories (Arabic has
 * all six: zero, one, two, few, many, other) and Intl number/date formatting,
 * all of which the platform already provides through Intl.PluralRules,
 * Intl.NumberFormat and Intl.DateTimeFormat. A library would add 15 to 40 KB
 * to the startup chunk for features Tiger does not use, and TypeScript key
 * checking comes for free from `keyof typeof en`.
 *
 * Message syntax:
 *   'Saved'                                   plain text
 *   'Imported {name}'                          {var} interpolation
 *   { one: '{count} request', other: '{count} requests' }
 *                                              plural, picked by `count`
 *   { '=0': 'No requests', one: …, other: … }  exact-zero override
 * An unknown {var} is left as written, so a missing value is visible.
 */

import type { en } from './messages/en'
import { DEFAULT_LOCALE, textDirection, type Locale } from './locales'

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'

export type PluralMessage = { readonly [K in PluralCategory]?: string } & {
  readonly other: string
  /** Exact match for zero ("No requests"), checked before the plural rules. */
  readonly '=0'?: string
}

export type Message = string | PluralMessage

/** The English catalog is the source of truth for which keys exist. */
export type EnglishCatalog = typeof en
export type MessageKey = keyof EnglishCatalog & string

/** Any other locale: every key optional, missing ones fall back to English. */
export type LocaleCatalog = { readonly [K in MessageKey]?: Message }

/** A namespace file of a non-English locale, typed against its English twin. */
export type NamespaceCatalog<E> = { readonly [K in keyof E]?: Message }

export type Vars = Readonly<Record<string, string | number>>

export interface Translator {
  (key: MessageKey, vars?: Vars): string
  readonly locale: Locale
  readonly dir: 'ltr' | 'rtl'
  /** True when the active locale has its own text for this key (not the fallback). */
  has(key: MessageKey): boolean
  /**
   * Text shown next to translated words but not produced by t() (a size such
   * as "46 B", a file name): in a right-to-left locale its Latin runs are
   * isolated so they keep their order; unchanged elsewhere.
   */
  ltr(text: string): string
  /** The English (source) text of a key, e.g. to search by English command names. */
  source(key: MessageKey, vars?: Vars): string
  /** Locale digits and grouping: 1,234.5 / 1 234,5 / 1.234,5. */
  number(value: number, options?: Intl.NumberFormatOptions): string
  date(value: Date | number, options?: Intl.DateTimeFormatOptions): string
  /** "3 minutes ago", "in 2 days". */
  relativeTime(value: number, unit: Intl.RelativeTimeFormatUnit): string
  /** "a, b and c" in the locale's words. */
  list(items: readonly string[], type?: 'conjunction' | 'disjunction'): string
}

/**
 * The BCP 47 tag used with Intl. Arabic keeps Latin digits (ar-u-nu-latn):
 * status codes, sizes and timings then read the same as in the raw response
 * and in code, which is what Arabic developer tools commonly do.
 */
export function intlTag(locale: Locale): string {
  return locale === 'ar' ? 'ar-u-nu-latn' : locale
}

export function isPluralMessage(m: Message | undefined): m is PluralMessage {
  return typeof m === 'object' && m !== null && typeof (m as PluralMessage).other === 'string'
}

/** Every {name} placeholder a message uses (all plural forms merged), sorted. */
export function placeholders(m: Message): string[] {
  const texts = typeof m === 'string' ? [m] : Object.values(m).filter((v): v is string => typeof v === 'string')
  const names = new Set<string>()
  for (const text of texts) for (const match of text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)) names.add(match[1])
  return [...names].sort()
}

const LRI = '\u2066'
const PDI = '\u2069'
/**
 * A run of Latin letters and digits plus the ASCII punctuation that travels
 * with them (.tiger, (Cmd+Enter), {{baseUrl}}, 46 B). No Arabic, no controls.
 */
const LTR_RUN = /[\p{Script=Latin}\d.(\[{<"'`@#$%&*+\-/\\=_~|^][\p{Script=Latin}\d \x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e·]*/gu
const TRAILING = /[\s.,:;!?]+$/
const HAS_LATIN = /\p{Script=Latin}/u

/**
 * Right-to-left text with Latin inside (".tiger", "(Cmd+Enter)", "46 B",
 * "{{baseUrl}}", a request name) reorders its punctuation and units around
 * the Arabic: ".tiger" shows as "tiger.", "8 ms" as "ms 8". Each Latin
 * run is wrapped in a left-to-right isolate (LRI ... PDI), which keeps it
 * intact as one unit inside the Arabic sentence. Screen readers ignore the
 * two invisible controls. Runs without a Latin letter (plain numbers) are
 * left alone: digits already read correctly in Arabic.
 */
export function isolateLtrRuns(text: string): string {
  return text.replace(LTR_RUN, (run) => {
    let core = run.replace(TRAILING, '')
    // Keep brackets balanced: a lone closing one, or an opening one at the end,
    // belongs to the Arabic sentence around the run.
    for (;;) {
      if (/[)\]}]$/.test(core) && !/[(\[{]/.test(core)) core = core.slice(0, -1).replace(TRAILING, '')
      else if (/[(\[{<]$/.test(core)) core = core.slice(0, -1).replace(TRAILING, '')
      else break
    }
    if (!core || !HAS_LATIN.test(core)) return run
    return LRI + core + PDI + run.slice(core.length)
  })
}

/**
 * "5 seconds ago", "3 hours ago", "2 days ago" (or later: "in 2 days") in the
 * translator's language, picking the unit by distance. `at` and `now` are ms.
 */
export function timeAgo(at: number, t: Translator, now: number = Date.now()): string {
  const diff = Math.round((at - now) / 1000)
  const abs = Math.abs(diff)
  if (abs < 60) return t.relativeTime(diff, 'second')
  if (abs < 3600) return t.relativeTime(Math.round(diff / 60), 'minute')
  if (abs < 86400) return t.relativeTime(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 30) return t.relativeTime(Math.round(diff / 86400), 'day')
  if (abs < 86400 * 365) return t.relativeTime(Math.round(diff / (86400 * 30)), 'month')
  return t.relativeTime(Math.round(diff / (86400 * 365)), 'year')
}

export function createTranslator(
  locale: Locale,
  catalog: LocaleCatalog | undefined,
  fallback: LocaleCatalog
): Translator {
  const tag = intlTag(locale)
  const plurals = new Intl.PluralRules(tag)
  let sourcePlurals: Intl.PluralRules | undefined
  const counts = new Intl.NumberFormat(tag)
  const plainNumbers = new Intl.NumberFormat(tag, { useGrouping: false, maximumFractionDigits: 20 })
  let relative: Intl.RelativeTimeFormat | undefined
  const own = locale === DEFAULT_LOCALE ? fallback : (catalog ?? {})

  const pick = (m: Message, count: number | undefined, rules: Intl.PluralRules = plurals): string => {
    if (typeof m === 'string') return m
    if (count === undefined) return m.other
    if (count === 0 && m['=0'] !== undefined) return m['=0']
    const category = rules.select(count) as PluralCategory
    return m[category] ?? m.other
  }

  const format = (text: string, vars: Vars | undefined): string => {
    if (!vars) return text
    return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (whole, name: string) => {
      const value = vars[name]
      if (value === undefined) return whole
      if (typeof value === 'number') {
        return name === 'count' ? counts.format(value) : plainNumbers.format(value)
      }
      return value
    })
  }

  const rtl = textDirection(locale) === 'rtl'
  const t = ((key: MessageKey, vars?: Vars): string => {
    const m = (own[key] as Message | undefined) ?? (fallback[key] as Message | undefined)
    if (m === undefined) return key
    const count = typeof vars?.count === 'number' ? vars.count : undefined
    const text = format(pick(m, count), vars)
    return rtl ? isolateLtrRuns(text) : text
  }) as Translator

  Object.assign(t, {
    locale,
    dir: textDirection(locale),
    has: (key: MessageKey) => own[key] !== undefined,
    ltr: (text: string) => (rtl ? isolateLtrRuns(text) : text),
    source: (key: MessageKey, vars?: Vars) => {
      const m = fallback[key] as Message | undefined
      if (m === undefined) return key
      sourcePlurals ??= new Intl.PluralRules('en')
      const count = typeof vars?.count === 'number' ? vars.count : undefined
      return format(pick(m, count, sourcePlurals), vars)
    },
    number: (value: number, options?: Intl.NumberFormatOptions) =>
      options ? new Intl.NumberFormat(tag, options).format(value) : counts.format(value),
    date: (value: Date | number, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(tag, options).format(value),
    relativeTime: (value: number, unit: Intl.RelativeTimeFormatUnit) => {
      relative ??= new Intl.RelativeTimeFormat(tag, { numeric: 'auto' })
      return relative.format(value, unit)
    },
    list: (items: readonly string[], type: 'conjunction' | 'disjunction' = 'conjunction') =>
      new Intl.ListFormat(tag, { type }).format(items)
  })
  return t
}
