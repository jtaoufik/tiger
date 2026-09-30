#!/usr/bin/env node
/**
 * Regenerates website/sitemap.xml from the pages under website/.
 * lastmod is the date of the last commit that touched the page, or today when
 * the page has uncommitted changes.
 *
 *   node scripts/build-sitemap.mjs
 */
import { readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = join(REPO, 'website')
const BASE = 'https://jtaoufik.github.io/tiger'

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name === 'index.html') out.push(p)
  }
  return out
}

const git = (...args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim()
const today = new Date().toISOString().slice(0, 10)

const rows = walk(ROOT).map((file) => {
  const rel = relative(REPO, file)
  const dirty = git('status', '--porcelain', '--', rel) !== ''
  const committed = git('log', '-1', '--format=%cs', '--', rel)
  const lastmod = dirty || !committed ? today : committed
  const path = relative(ROOT, file).replace(/index\.html$/, '')
  const depth = path === '' ? 0 : path.split('/').filter(Boolean).length
  return { loc: `${BASE}/${path}`, lastmod, priority: depth === 0 ? '1.0' : depth === 1 ? '0.8' : '0.6' }
})
rows.sort((a, b) => (a.loc === `${BASE}/` ? -1 : b.loc === `${BASE}/` ? 1 : a.loc.localeCompare(b.loc)))

const xml =
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  rows
    .map((r) => `  <url>\n    <loc>${r.loc}</loc>\n    <lastmod>${r.lastmod}</lastmod>\n    <priority>${r.priority}</priority>\n  </url>\n`)
    .join('') +
  '</urlset>\n'
writeFileSync(join(ROOT, 'sitemap.xml'), xml)
console.log(`wrote ${rows.length} urls`)
