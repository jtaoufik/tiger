#!/usr/bin/env node
/**
 * i18n guard. Fails (exit 1) when:
 *
 *  1. user-visible text is hardcoded in src/renderer or src/main instead of
 *     coming from the catalogs:
 *       - JSX text:                         <button>Save</button>
 *       - text attributes:                  aria-label="Close", title, placeholder, alt, ...
 *       - text props of objects:            { label: 'Open' }, { title: '…' } (menus, dialogs)
 *       - toast()/announce() literals:      toast('Saved'), announce(`Copied ${x}`)
 *     A string counts as text when its literal part has a word of 2+ letters
 *     (any script). Legit literals go in scripts/i18n-allowlist.json, or get
 *     an `// i18n-ignore` comment on the line (or the line above).
 *
 *  2. the catalogs disagree with English (src/core/i18n/messages):
 *       - a key missing in a locale, or a key English does not have;
 *       - different {placeholders} than English;
 *       - a plural message missing a form the locale needs (Arabic: all six);
 *       - an em dash in English copy (house style);
 *       - a grammatical fragment slot: {noun}, {row}, {thing}... A translated
 *         word spliced into a translated sentence breaks gender, articles and
 *         case (fr "Ajouter : paramètre"). Write one full message per case.
 *
 * Usage: node scripts/i18n-check.mjs [--quiet] [--only=<path part>] [--ns=<namespace>]
 *   --only  report hardcoded text only in files whose path contains this
 *   --ns    check only catalog keys of this namespace (e.g. --ns=sidebar)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { build } from 'esbuild'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const quiet = process.argv.includes('--quiet')
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const only = arg('only')
const ns = arg('ns')
const allow = JSON.parse(readFileSync(join(ROOT, 'scripts/i18n-allowlist.json'), 'utf8'))
const ALLOWED = new Set(allow.strings)
const ALLOWED_FILES = new Set(allow.files ?? [])
const ALLOWED_PATTERNS = (allow.patterns ?? []).map((p) => new RegExp(p, 'u'))

/** JSX attributes whose value is read or shown to people. */
const TEXT_ATTRS = new Set([
  'aria-label',
  'aria-description',
  'aria-roledescription',
  'aria-valuetext',
  'aria-placeholder',
  'title',
  'placeholder',
  'alt',
  'label',
  'description',
  'desc',
  'hint',
  'intro',
  'topic',
  'heading',
  'subtitle',
  'emptyText',
  'emptyLabel',
  'confirmLabel',
  'cancelLabel',
  'submitLabel',
  'message',
  'detail',
  'tooltip'
])

/** Object properties that carry UI text (menu items, dialogs, tab defs). */
const TEXT_PROPS = new Set([
  'label',
  'title',
  'description',
  'desc',
  'intro',
  'hint',
  'placeholder',
  'message',
  'detail',
  'buttonLabel',
  'nameFieldLabel',
  'emptyText',
  'confirmLabel',
  'cancelLabel',
  'tooltip',
  'text'
])

/** Calls whose first argument is shown or spoken. */
const TEXT_CALLS = new Set(['toast', 'announce', 'showToast', 'notify', 'alert', 'confirm', 'setStatus'])

const WORD = /\p{L}{2,}/u

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p)
  }
  return out
}

function isAllowed(text) {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean || !WORD.test(clean)) return true
  if (ALLOWED.has(clean)) return true
  return ALLOWED_PATTERNS.some((re) => re.test(clean))
}

/** The literal (non-${}) text of a string-ish node, or null when it is not one. */
function literalText(node) {
  if (!node) return null
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(' ')
  }
  if (ts.isParenthesizedExpression(node)) return literalText(node.expression)
  if (ts.isConditionalExpression(node)) {
    const a = literalText(node.whenTrue)
    const b = literalText(node.whenFalse)
    return [a, b].filter((x) => x !== null).join(' ') || null
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const a = literalText(node.left)
    const b = literalText(node.right)
    return [a, b].filter((x) => x !== null).join(' ') || null
  }
  return null
}

function scanSources() {
  const files = [...walk(join(ROOT, 'src/renderer')), ...walk(join(ROOT, 'src/main'))]
  const problems = []
  for (const file of files) {
    const rel = relative(ROOT, file).split('\\').join('/')
    if (ALLOWED_FILES.has(rel)) continue
    if (only && !rel.includes(only)) continue
    const text = readFileSync(file, 'utf8')
    const lines = text.split('\n')
    const ignored = (pos) => {
      const line = ts.getLineAndCharacterOfPosition(sf, pos).line
      return /i18n-ignore/.test(lines[line] ?? '') || /i18n-ignore/.test(lines[line - 1] ?? '')
    }
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const report = (node, kind, value) => {
      if (isAllowed(value) || ignored(node.getStart(sf))) return
      const { line, character } = ts.getLineAndCharacterOfPosition(sf, node.getStart(sf))
      problems.push(`${rel}:${line + 1}:${character + 1}  ${kind}  ${JSON.stringify(value.replace(/\s+/g, ' ').trim())}`)
    }
    const visit = (node) => {
      if (ts.isJsxText(node)) {
        report(node, 'jsx-text', node.text)
      } else if (ts.isJsxAttribute(node)) {
        const name = node.name.getText(sf)
        if (TEXT_ATTRS.has(name) && node.initializer) {
          const init = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer
          const value = literalText(init)
          if (value !== null) report(node, `attr ${name}`, value)
        }
      } else if (ts.isJsxExpression(node) && node.parent && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
        // {'text'} or {`text ${x}`} as a child
        const value = literalText(node.expression)
        if (value !== null) report(node, 'jsx-text', value)
      } else if (ts.isPropertyAssignment(node)) {
        const name = node.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) ? node.name.text : ''
        if (TEXT_PROPS.has(name)) {
          const value = literalText(node.initializer)
          if (value !== null) report(node, `prop ${name}`, value)
        }
      } else if (ts.isCallExpression(node)) {
        const callee = node.expression
        const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : ''
        if (TEXT_CALLS.has(name) && node.arguments[0]) {
          const value = literalText(node.arguments[0])
          if (value !== null) report(node, `call ${name}()`, value)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return problems
}

async function loadCatalogs() {
  const result = await build({
    entryPoints: [join(ROOT, 'src/core/i18n/all.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
    logLevel: 'silent'
  })
  const code = result.outputFiles[0].text
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
  return mod.CATALOGS
}

function placeholders(m) {
  const texts = typeof m === 'string' ? [m] : Object.values(m).filter((v) => typeof v === 'string')
  const names = new Set()
  for (const t of texts) for (const x of t.matchAll(/\{([a-zA-Z0-9_]+)\}/g)) names.add(x[1])
  return [...names].sort().join(',')
}

/**
 * Placeholder names that mean "a translated word goes here". Placeholders
 * are for data (names, numbers, paths, codes), never for pieces of grammar.
 */
const FRAGMENT_SLOTS = new Set(['noun', 'nouns', 'row', 'thing', 'what', 'article', 'adjective', 'verb', 'plural', 'gender'])

function checkCatalogs(catalogs) {
  const problems = []
  const en = catalogs.en
  const keys = Object.keys(en).filter((k) => !ns || k.startsWith(`${ns}.`))
  for (const key of keys) {
    const m = en[key]
    const texts = typeof m === 'string' ? [m] : Object.values(m)
    if (texts.some((t) => /\u2014/.test(t))) problems.push(`en  ${key}  em dash in English copy`)
  }
  for (const [locale, catalog] of Object.entries(catalogs)) {
    for (const [key, m] of Object.entries(catalog)) {
      if (ns && !key.startsWith(`${ns}.`)) continue
      const slots = placeholders(m).split(',').filter((p) => FRAGMENT_SLOTS.has(p))
      if (slots.length) problems.push(`${locale}  ${key}  splices a translated fragment {${slots.join('}, {')}}: write a full message per case`)
    }
    if (locale === 'en') continue
    const needed = new Intl.PluralRules(locale).resolvedOptions().pluralCategories
    for (const key of keys) {
      const m = catalog[key]
      if (m === undefined) {
        problems.push(`${locale}  ${key}  missing (falls back to English)`)
        continue
      }
      const empty = typeof m === 'string' ? !m.trim() : !m.other?.trim()
      if (empty) problems.push(`${locale}  ${key}  empty`)
      if (placeholders(m) !== placeholders(en[key])) {
        problems.push(`${locale}  ${key}  placeholders {${placeholders(m)}} differ from English {${placeholders(en[key])}}`)
      }
      if (typeof en[key] === 'object' && typeof m === 'object') {
        // Arabic must spell out all six forms; elsewhere 'many' may fall back to 'other'.
        const required = locale === 'ar' ? needed : needed.filter((c) => c !== 'many')
        for (const c of required) {
          if (m[c] === undefined) problems.push(`${locale}  ${key}  plural form "${c}" missing`)
        }
      }
    }
    for (const key of Object.keys(catalog)) {
      if (ns && !key.startsWith(`${ns}.`)) continue
      if (!(key in en)) problems.push(`${locale}  ${key}  not an English key`)
    }
  }
  return problems
}

const source = scanSources()
const catalogs = await loadCatalogs()
const catalog = checkCatalogs(catalogs)

if (source.length) {
  console.error(`\nHardcoded UI text (${source.length}). Move it to src/core/i18n/messages/en and use t():\n`)
  for (const p of quiet ? source.slice(0, 40) : source) console.error(`  ${p}`)
  if (quiet && source.length > 40) console.error(`  … and ${source.length - 40} more`)
}
if (catalog.length) {
  console.error(`\nCatalog problems (${catalog.length}):\n`)
  for (const p of quiet ? catalog.slice(0, 40) : catalog) console.error(`  ${p}`)
  if (quiet && catalog.length > 40) console.error(`  … and ${catalog.length - 40} more`)
}
const keyCount = Object.keys(catalogs.en).length
const locales = Object.keys(catalogs).length
if (source.length || catalog.length) {
  console.error(`\ni18n-check: FAIL (${source.length} hardcoded, ${catalog.length} catalog)`)
  process.exit(1)
}
console.log(`i18n-check: OK (${keyCount} keys x ${locales} locales, no hardcoded UI text)`)
