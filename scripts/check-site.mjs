#!/usr/bin/env node
/**
 * Checks the static site in website/: broken internal links and anchors, and
 * the basic on-page SEO of every page (title, description, canonical, one H1,
 * alt text, JSON-LD that parses, sitemap coverage). No dependencies.
 *
 *   node scripts/check-site.mjs
 *
 * Exit code 1 when anything fails. Warnings (missing Open Graph or Twitter
 * tags) do not fail the run.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'website')
const BASE = 'https://jtaoufik.github.io/tiger'
const PREFIX = '/tiger/'

const errors = []
const warnings = []
const fail = (page, msg) => errors.push(`${page}: ${msg}`)
const warn = (page, msg) => warnings.push(`${page}: ${msg}`)

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.html')) out.push(p)
  }
  return out
}

const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

/** Path of a page under website/ -> its public URL path ("/tiger/docs/faq/"). */
const urlPathOf = (file) => {
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  return PREFIX + rel.replace(/index\.html$/, '')
}

/** Public path ("/tiger/docs/faq/#x") -> file on disk, or null. */
function resolveTarget(pathname) {
  if (!pathname.startsWith(PREFIX)) return null
  const rel = pathname.slice(PREFIX.length)
  const direct = join(ROOT, rel)
  if (rel === '' || rel.endsWith('/')) {
    const idx = join(direct, 'index.html')
    return existsSync(idx) ? idx : null
  }
  if (existsSync(direct) && statSync(direct).isFile()) return direct
  const idx = join(direct, 'index.html')
  return existsSync(idx) ? idx : null
}

const files = walk(ROOT)
const idsByFile = new Map()
const pages = new Map()
for (const f of files) {
  const html = readFileSync(f, 'utf8')
  pages.set(f, html)
  idsByFile.set(f, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])))
}

const titles = new Map()
const descriptions = new Map()

for (const [file, html] of pages) {
  const page = relative(ROOT, file)
  const url = urlPathOf(file)

  // --- links and assets -------------------------------------------------
  // Drop HTML comments and code blocks so examples are not checked.
  const live = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<pre[\s\S]*?<\/pre>/g, '')
  for (const m of live.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
    const raw = decode(m[1])
    if (!raw || /^(https?:|mailto:|tel:|data:|javascript:)/.test(raw)) continue
    const [pathPart, hash] = raw.split('#')
    let targetFile
    if (pathPart === '') targetFile = file
    else if (pathPart.startsWith('/')) {
      if (!pathPart.startsWith(PREFIX)) {
        fail(page, `link outside /tiger/: ${raw}`)
        continue
      }
      targetFile = resolveTarget(pathPart)
    } else {
      targetFile = resolveTarget(new URL(pathPart, 'http://x' + url).pathname)
    }
    if (!targetFile) {
      fail(page, `broken link: ${raw}`)
      continue
    }
    if (hash && targetFile.endsWith('.html') && !idsByFile.get(targetFile)?.has(hash)) {
      // Headings get ids from nav.js at runtime; only fail on ids that no
      // element declares and that are not plain heading slugs.
      const target = pages.get(targetFile) ?? ''
      const slugs = [...target.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/g)].map((h) =>
        decode(h[1].replace(/<[^>]+>/g, ''))
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
      )
      if (!slugs.includes(hash)) fail(page, `broken anchor: ${raw}`)
    }
  }

  // --- head -------------------------------------------------------------
  const title = decode((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').trim()
  const desc = decode((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '')
  const canonical = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1]
  if (!title) fail(page, 'missing <title>')
  else if (title.length > 60) fail(page, `title is ${title.length} chars (max 60): ${title}`)
  if (!desc) fail(page, 'missing meta description')
  else if (desc.length > 155) fail(page, `description is ${desc.length} chars (max 155)`)
  if (titles.has(title)) fail(page, `duplicate title with ${titles.get(title)}`)
  titles.set(title, page)
  if (descriptions.has(desc)) fail(page, `duplicate description with ${descriptions.get(desc)}`)
  descriptions.set(desc, page)
  if (!canonical) fail(page, 'missing canonical')
  else if (canonical !== BASE + url.slice(PREFIX.length - 1))
    fail(page, `canonical ${canonical} does not match ${BASE + url.slice(PREFIX.length - 1)}`)

  const h1s = (html.match(/<h1[\s>]/g) || []).length
  if (h1s !== 1) fail(page, `${h1s} <h1> elements (want 1)`)

  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt="[^"]+"/.test(m[0])) fail(page, `img without alt text: ${m[0].slice(0, 80)}`)
  }

  for (const prop of ['og:title', 'og:description', 'og:image', 'og:url'])
    if (!html.includes(`property="${prop}"`)) warn(page, `missing ${prop}`)
  if (!html.includes('name="twitter:card"')) warn(page, 'missing twitter:card')
  const og = (html.match(/property="og:image" content="([^"]*)"/) || [])[1]
  if (og && og.startsWith(BASE + '/') && !existsSync(join(ROOT, og.slice(BASE.length + 1))))
    fail(page, `og:image file missing: ${og}`)

  // --- JSON-LD ----------------------------------------------------------
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(m[1])
    } catch (e) {
      fail(page, `JSON-LD does not parse: ${e.message}`)
    }
  }
}

// --- sitemap ------------------------------------------------------------
const sitemapFile = join(ROOT, 'sitemap.xml')
const sitemap = readFileSync(sitemapFile, 'utf8')
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
const lastmods = (sitemap.match(/<lastmod>/g) || []).length
if (lastmods !== locs.length) fail('sitemap.xml', `${lastmods} lastmod for ${locs.length} urls`)
const locSet = new Set(locs)
for (const l of locs) {
  if (!l.startsWith(BASE + '/')) fail('sitemap.xml', `not on ${BASE}: ${l}`)
  else if (!resolveTarget(PREFIX + l.slice(BASE.length + 1))) fail('sitemap.xml', `no page for ${l}`)
}
for (const file of pages.keys()) {
  const u = BASE + urlPathOf(file).slice(PREFIX.length - 1)
  if (!locSet.has(u)) fail('sitemap.xml', `missing ${u}`)
}
if (!/Sitemap: https:\/\/jtaoufik\.github\.io\/tiger\/sitemap\.xml/.test(readFileSync(join(ROOT, 'robots.txt'), 'utf8')))
  fail('robots.txt', 'does not point to the sitemap')

for (const w of warnings) console.log('warn ', w)
for (const e of errors) console.log('FAIL ', e)
console.log(`\n${pages.size} pages, ${locs.length} sitemap urls, ${errors.length} errors, ${warnings.length} warnings`)
process.exit(errors.length ? 1 : 0)
