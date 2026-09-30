/**
 * Every catalog, statically. For the main process (menu, dialogs: it has no
 * startup-chunk budget and needs a synchronous translator) and for tests.
 * The renderer must not import this file; it uses ./load instead.
 */
import { en } from './messages/en'
import zhCN from './messages/zh-CN'
import hi from './messages/hi'
import es from './messages/es'
import fr from './messages/fr'
import ar from './messages/ar'
import type { Locale } from './locales'
import { createTranslator, type LocaleCatalog, type Translator } from './translator'

export const CATALOGS: Record<Locale, LocaleCatalog> = { en, 'zh-CN': zhCN, hi, es, fr, ar }

export function translatorFor(locale: Locale): Translator {
  return createTranslator(locale, CATALOGS[locale], en)
}
