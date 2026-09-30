/**
 * The English catalog and translator, statically. For the main process and
 * tests. The renderer must not import this file (it would put every English
 * string in the startup chunk); it loads English through ./load instead.
 */
import { en } from './messages/en'
import { createTranslator, type Translator } from './translator'

export { en }

/** Source text and fallback of every other locale. */
export const englishT: Translator = createTranslator('en', undefined, en)
