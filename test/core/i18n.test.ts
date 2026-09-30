import { describe, expect, it } from 'vitest'
import {
  createTranslator,
  isLanguageChoice,
  isRtl,
  isolateLtrRuns,
  timeAgo,
  LOCALE_NATIVE_NAMES,
  matchLocale,
  matchOne,
  placeholders,
  resolveLanguage,
  SUPPORTED_LOCALES,
  textDirection,
  type LocaleCatalog,
  type Message,
  type MessageKey
} from '../../src/core/i18n'
import { CATALOGS, translatorFor } from '../../src/core/i18n/all'
import { en, englishT } from '../../src/core/i18n/english'
import { EN_NAMESPACES } from '../../src/core/i18n/messages/en'
import { loadCatalog } from '../../src/core/i18n/load'

describe('locale matching', () => {
  it('maps region variants onto the supported base language', () => {
    expect(matchOne('es-MX')).toBe('es')
    expect(matchOne('es-419')).toBe('es')
    expect(matchOne('fr-CA')).toBe('fr')
    expect(matchOne('fr_FR')).toBe('fr')
    expect(matchOne('hi-IN')).toBe('hi')
    expect(matchOne('ar-EG')).toBe('ar')
    expect(matchOne('ar-SA')).toBe('ar')
    expect(matchOne('en-GB')).toBe('en')
    expect(matchOne('EN')).toBe('en')
  })

  it('maps Simplified Chinese tags only', () => {
    expect(matchOne('zh-CN')).toBe('zh-CN')
    expect(matchOne('zh-Hans')).toBe('zh-CN')
    expect(matchOne('zh-Hans-CN')).toBe('zh-CN')
    expect(matchOne('zh-Hans-HK')).toBe('zh-CN')
    expect(matchOne('zh-SG')).toBe('zh-CN')
    expect(matchOne('zh')).toBe('zh-CN')
    expect(matchOne('zh-TW')).toBeNull()
    expect(matchOne('zh-HK')).toBeNull()
    expect(matchOne('zh-Hant')).toBeNull()
    expect(matchOne('zh-Hant-TW')).toBeNull()
  })

  it('returns null for unsupported or empty tags', () => {
    expect(matchOne('de-DE')).toBeNull()
    expect(matchOne('pt-BR')).toBeNull()
    expect(matchOne('')).toBeNull()
  })

  it('takes the first preference that maps, else English', () => {
    expect(matchLocale(['de-DE', 'fr-FR', 'en-US'])).toBe('fr')
    expect(matchLocale(['zh-TW', 'ja-JP', 'es-MX'])).toBe('es')
    expect(matchLocale(['de-DE', 'pt-BR'])).toBe('en')
    expect(matchLocale([])).toBe('en')
    expect(matchLocale([undefined, null, '', 'ar'])).toBe('ar')
  })

  it('resolves the Language setting: explicit wins, system follows the OS', () => {
    expect(resolveLanguage('hi', ['fr-FR'])).toBe('hi')
    expect(resolveLanguage('system', ['fr-FR'])).toBe('fr')
    expect(resolveLanguage(undefined, ['zh-Hans-CN'])).toBe('zh-CN')
    expect(isLanguageChoice('system')).toBe(true)
    expect(isLanguageChoice('zh-CN')).toBe(true)
    expect(isLanguageChoice('de')).toBe(false)
  })

  it('knows the reading direction and each language by its own name', () => {
    expect(isRtl('ar')).toBe(true)
    expect(textDirection('ar')).toBe('rtl')
    for (const l of SUPPORTED_LOCALES.filter((x) => x !== 'ar')) expect(textDirection(l)).toBe('ltr')
    expect(LOCALE_NATIVE_NAMES).toEqual({
      en: 'English',
      'zh-CN': '中文',
      hi: 'हिन्दी',
      es: 'Español',
      fr: 'Français',
      ar: 'العربية'
    })
  })
})

// A tiny catalog pair to test the translator without depending on real copy.
const fakeEn = {
  hello: 'Hello {name}',
  saved: 'Saved',
  items: { one: '{count} item', other: '{count} items' },
  zeroable: { '=0': 'No items', one: '{count} item', other: '{count} items' },
  port: 'Port {port}'
} as unknown as LocaleCatalog
const k = (key: string) => key as MessageKey

describe('translator', () => {
  it('interpolates {vars}, leaving unknown ones visible', () => {
    const t = createTranslator('en', undefined, fakeEn)
    expect(t(k('hello'), { name: 'Ada' })).toBe('Hello Ada')
    expect(t(k('hello'))).toBe('Hello {name}')
    expect(t(k('hello'), { other: 'x' })).toBe('Hello {name}')
  })

  it('falls back to English per key, and to the key itself when nobody has it', () => {
    const fr = createTranslator('fr', { hello: 'Bonjour {name}' } as unknown as LocaleCatalog, fakeEn)
    expect(fr(k('hello'), { name: 'Ada' })).toBe('Bonjour Ada')
    expect(fr(k('saved'))).toBe('Saved')
    expect(fr.has(k('hello'))).toBe(true)
    expect(fr.has(k('saved'))).toBe(false)
    expect(fr(k('nope'))).toBe('nope')
  })

  it('picks English plural forms by count, with an exact zero override', () => {
    const t = createTranslator('en', undefined, fakeEn)
    expect(t(k('items'), { count: 1 })).toBe('1 item')
    expect(t(k('items'), { count: 2 })).toBe('2 items')
    expect(t(k('items'), { count: 0 })).toBe('0 items')
    expect(t(k('zeroable'), { count: 0 })).toBe('No items')
    expect(t(k('items'))).toBe('{count} items')
  })

  it('formats counts with locale grouping but other numbers without it', () => {
    const t = createTranslator('en', undefined, fakeEn)
    expect(t(k('items'), { count: 12345 })).toBe('12,345 items')
    expect(t(k('port'), { port: 8080 })).toBe('Port 8080')
    const fr = createTranslator('fr', { items: { one: '{count} élément', other: '{count} éléments' } } as unknown as LocaleCatalog, fakeEn)
    expect(fr(k('items'), { count: 12345 }).replace(/\s/g, ' ')).toBe('12 345 éléments')
  })

  it('handles all six Arabic plural forms', () => {
    const ar = createTranslator(
      'ar',
      {
        items: {
          zero: 'لا عناصر',
          one: 'عنصر واحد',
          two: 'عنصران',
          few: '{count} عناصر',
          many: '{count} عنصرًا',
          other: '{count} عنصر'
        }
      } as unknown as LocaleCatalog,
      fakeEn
    )
    expect(ar(k('items'), { count: 0 })).toBe('لا عناصر')
    expect(ar(k('items'), { count: 1 })).toBe('عنصر واحد')
    expect(ar(k('items'), { count: 2 })).toBe('عنصران')
    expect(ar(k('items'), { count: 3 })).toBe('3 عناصر')
    expect(ar(k('items'), { count: 10 })).toBe('10 عناصر')
    expect(ar(k('items'), { count: 11 })).toBe('11 عنصرًا')
    expect(ar(k('items'), { count: 99 })).toBe('99 عنصرًا')
    expect(ar(k('items'), { count: 100 })).toBe('100 عنصر')
    expect(ar(k('items'), { count: 102 })).toBe('102 عنصر')
    expect(ar(k('items'), { count: 103 })).toBe('103 عناصر')
  })

  it('uses the plural rules of each language (Hindi, French, Chinese)', () => {
    const cat = (one: string, other: string) => ({ items: { one, other } }) as unknown as LocaleCatalog
    const hi = createTranslator('hi', cat('{count} आइटम (one)', '{count} आइटम'), fakeEn)
    expect(hi(k('items'), { count: 0 })).toBe('0 आइटम (one)') // Hindi: 0 and 1 are "one"
    expect(hi(k('items'), { count: 2 })).toBe('2 आइटम')
    const fr = createTranslator('fr', cat('{count} élément', '{count} éléments'), fakeEn)
    expect(fr(k('items'), { count: 0 })).toBe('0 élément') // French: 0 and 1 are singular
    expect(fr(k('items'), { count: 1.5 })).toBe('1,5 élément')
    expect(fr(k('items'), { count: 2 })).toBe('2 éléments')
    const zh = createTranslator('zh-CN', { items: { other: '{count} 项' } } as unknown as LocaleCatalog, fakeEn)
    expect(zh(k('items'), { count: 1 })).toBe('1 项')
  })

  it('keeps Latin digits in Arabic, and formats dates and lists per locale', () => {
    const ar = createTranslator('ar', {}, fakeEn)
    expect(ar.number(1234)).toMatch(/^1[,٬]234$/)
    expect(ar.dir).toBe('rtl')
    const date = new Date(Date.UTC(2026, 8, 30, 12))
    const es = createTranslator('es', {}, fakeEn)
    expect(es.date(date, { month: 'long', timeZone: 'UTC' })).toBe('septiembre')
    expect(es.list(['a', 'b', 'c'])).toBe('a, b y c')
    expect(createTranslator('fr', {}, fakeEn).relativeTime(-1, 'day')).toBe('hier')
  })

  it('isolates Latin runs inside right-to-left text so punctuation and units keep their order', () => {
    const L = '\u2066'
    const P = '\u2069'
    expect(isolateLtrRuns('مجلد من ملفات .tiger.')).toBe(`مجلد من ملفات ${L}.tiger${P}.`)
    expect(isolateLtrRuns('إرسال (Cmd+Enter). تظهر')).toBe(`إرسال ${L}(Cmd+Enter)${P}. تظهر`)
    expect(isolateLtrRuns('46 B')).toBe(`${L}46 B${P}`)
    expect(isolateLtrRuns('8 ms')).toBe(`${L}8 ms${P}`)
    expect(isolateLtrRuns('استخدم {{baseUrl}} هنا')).toBe(`استخدم ${L}{{baseUrl}}${P} هنا`)
    expect(isolateLtrRuns('OpenAPI وWSDL وcurl.')).toBe(`${L}OpenAPI${P} و${L}WSDL${P} و${L}curl${P}.`)
    // Plain numbers and pure Arabic are left alone.
    expect(isolateLtrRuns('اسم الترويسة 1')).toBe('اسم الترويسة 1')
    expect(isolateLtrRuns('(الحقل 3)')).toBe('(الحقل 3)')
    expect(isolateLtrRuns('ملفات .bru (المجلدات مقبولة)')).toBe(`ملفات ${L}.bru${P} (المجلدات مقبولة)`)
  })

  it('applies the isolation in Arabic only', () => {
    const cat = { hello: 'افتح {name} (Cmd+K)' } as unknown as LocaleCatalog
    const ar = createTranslator('ar', cat, fakeEn)
    expect(ar(k('hello'), { name: 'List posts' })).toBe(`افتح ${'\u2066'}List posts (Cmd+K)${'\u2069'}`)
    expect(ar.ltr('46 B')).toBe('\u206646 B\u2069')
    const fr = createTranslator('fr', { hello: 'Ouvrir {name} (Cmd+K)' } as unknown as LocaleCatalog, fakeEn)
    expect(fr(k('hello'), { name: 'List posts' })).toBe('Ouvrir List posts (Cmd+K)')
    expect(fr.ltr('46 B')).toBe('46 B')
  })

  it('says how long ago in the language, picking the unit', () => {
    const now = Date.UTC(2026, 8, 30, 12)
    const en = createTranslator('en', undefined, fakeEn)
    expect(timeAgo(now - 5_000, en, now)).toBe('5 seconds ago')
    expect(timeAgo(now - 3 * 3600_000, en, now)).toBe('3 hours ago')
    expect(timeAgo(now - 86400_000, en, now)).toBe('yesterday')
    const ar = createTranslator('ar', {}, fakeEn)
    expect(timeAgo(now - 66_000, ar, now)).toBe('قبل دقيقة واحدة')
    const fr = createTranslator('fr', {}, fakeEn)
    expect(timeAgo(now - 2 * 86400_000, fr, now)).toBe('avant-hier')
  })

  it('lists the placeholders of a message across plural forms', () => {
    expect(placeholders('{a} and {b}' as Message)).toEqual(['a', 'b'])
    expect(placeholders({ one: '{count} x', other: '{count} {name}' })).toEqual(['count', 'name'])
  })
})

describe('catalogs', () => {
  const enKeys = Object.keys(en) as MessageKey[]

  it('prefixes every key with its namespace, so namespaces can never collide', () => {
    let total = 0
    for (const [ns, keys] of Object.entries(EN_NAMESPACES)) {
      for (const key of Object.keys(keys)) expect(key.startsWith(`${ns}.`), key).toBe(true)
      total += Object.keys(keys).length
    }
    expect(total).toBe(enKeys.length)
  })

  it('never splices a translated word into a sentence ({noun}, {row}: one full message per case)', () => {
    const fragments = ['noun', 'nouns', 'row', 'thing', 'what', 'article', 'adjective', 'verb', 'plural', 'gender']
    for (const locale of SUPPORTED_LOCALES) {
      for (const [key, m] of Object.entries(CATALOGS[locale])) {
        const bad = placeholders(m as Message).filter((p) => fragments.includes(p))
        expect(bad, `${locale} ${key}`).toEqual([])
      }
    }
  })

  it('has English copy without em dashes', () => {
    for (const key of enKeys) {
      const m = en[key] as Message
      const texts = typeof m === 'string' ? [m] : Object.values(m)
      for (const text of texts) expect(text, key).not.toMatch(/—/)
    }
  })

  describe.each(SUPPORTED_LOCALES.filter((l) => l !== 'en'))('%s', (locale) => {
    const catalog = CATALOGS[locale]

    it('translates every English key', () => {
      const missing = enKeys.filter((key) => catalog[key] === undefined)
      expect(missing).toEqual([])
    })

    it('has no keys English does not have', () => {
      expect(Object.keys(catalog).filter((key) => !(key in en))).toEqual([])
    })

    it('keeps the same {placeholders} as English', () => {
      for (const key of enKeys) {
        const m = catalog[key]
        if (m === undefined) continue
        expect(placeholders(m), `${locale} ${key}`).toEqual(placeholders(en[key] as Message))
      }
    })

    it('gives plural messages every form the language needs', () => {
      const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories
      const required = locale === 'ar' ? categories : categories.filter((c) => c !== 'many')
      for (const key of enKeys) {
        const m = catalog[key]
        if (typeof en[key] !== 'object' || typeof m !== 'object') continue
        for (const c of required) expect(m[c as keyof typeof m], `${locale} ${key} ${c}`).toBeDefined()
      }
    })

    it('loads lazily to the same catalog main uses', async () => {
      expect(await loadCatalog(locale)).toBe(catalog)
    })
  })

  it('renders every key in every locale without leaking a raw key or placeholder name', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const t = translatorFor(locale)
      for (const key of enKeys) {
        const vars = Object.fromEntries(placeholders(en[key] as Message).map((p) => [p, p === 'count' ? 3 : 'X']))
        const text = t(key, vars)
        expect(text, `${locale} ${key}`).not.toBe(key)
        expect(text, `${locale} ${key}`).not.toMatch(/\{[a-zA-Z0-9_]+\}/)
      }
    }
  })

  it('English translator is the fallback everywhere', () => {
    expect(englishT.locale).toBe('en')
    expect(englishT('common.cancel')).toBe('Cancel')
    expect(englishT('common.requests', { count: 1 })).toBe('1 request')
    expect(englishT('common.requests', { count: 4 })).toBe('4 requests')
  })
})
