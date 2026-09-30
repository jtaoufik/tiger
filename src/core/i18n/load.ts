/**
 * On-demand loading of the catalogs in the renderer. Each dynamic import
 * becomes its own chunk, so the startup chunk carries no catalog text at all;
 * the renderer loads English (the fallback) plus the active locale before its
 * first paint. The main process does not use this: it imports ./all.
 */
import type { Locale } from './locales'
import type { LocaleCatalog } from './translator'

/** English: the source text and every locale's fallback. Its own chunk too. */
export async function loadEnglish(): Promise<LocaleCatalog> {
  return (await import('./messages/en')).en
}

export async function loadCatalog(locale: Locale): Promise<LocaleCatalog | undefined> {
  switch (locale) {
    case 'en':
      return undefined
    case 'zh-CN':
      return (await import('./messages/zh-CN')).default
    case 'hi':
      return (await import('./messages/hi')).default
    case 'es':
      return (await import('./messages/es')).default
    case 'fr':
      return (await import('./messages/fr')).default
    case 'ar':
      return (await import('./messages/ar')).default
  }
}
