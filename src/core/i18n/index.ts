/**
 * Tiger's i18n layer. Pure (Intl only), shared by main and renderer.
 *
 * - ./locales     supported locales, system-language matching, RTL
 * - ./translator  t(key, vars), plurals, Intl number/date helpers, types
 * - ./messages    one folder per locale, one file per namespace
 * - ./load        lazy loading of every catalog, English included (renderer)
 * - ./all         every catalog statically (main process, tests)
 * - ./english     the English catalog and translator (main process, tests)
 *
 * This entry point holds no catalog text on purpose: the renderer imports it
 * from its startup chunk, which must stay small.
 */
export * from './locales'
export * from './translator'
