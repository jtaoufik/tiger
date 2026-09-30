#!/usr/bin/env node
/**
 * Re-sync electron-updater metadata after a release file was changed on disk
 * AFTER electron-builder wrote latest*.yml (SignPath swapping in a signed
 * installer, `stapler staple` rewriting a DMG). electron-updater verifies the
 * sha512 in latest*.yml against every download, so a stale hash would make
 * every in-app update fail with "sha512 checksum mismatch".
 *
 * For each file: recompute sha512 (base64) + size in the yml entries whose url
 * (or top-level path) is that file's name, and rebuild its .blockmap when one
 * exists (the differential-download map). Idempotent: running it on untouched
 * files leaves the yml unchanged.
 *
 *   node scripts/refresh-update-metadata.mjs release/latest.yml release/Tiger-Setup-1.2.3-windows-x64.exe
 */

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename } from 'node:path'
import YAML from 'yaml'

const require = createRequire(import.meta.url)

function sha512(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha512')
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('base64')))
  })
}

function rebuildBlockmap(file) {
  const blockmap = `${file}.blockmap`
  if (!existsSync(blockmap)) return
  const { appBuilderPath } = require('app-builder-bin')
  execFileSync(appBuilderPath, ['blockmap', '--input', file, '--output', blockmap], {
    stdio: ['ignore', 'ignore', 'inherit']
  })
  console.log(`rebuilt ${basename(blockmap)}`)
}

const [ymlPath, ...files] = process.argv.slice(2)
if (!ymlPath || files.length === 0) {
  console.error('usage: refresh-update-metadata.mjs <latest*.yml> <file>...')
  process.exit(2)
}

// Edit the parsed document in place so everything else keeps its exact
// formatting (releaseDate must stay a quoted string, not a YAML timestamp).
const doc = YAML.parseDocument(readFileSync(ymlPath, 'utf8'))
const info = doc.toJS()
if (!info || !Array.isArray(info.files)) {
  console.error(`${ymlPath}: not an electron-updater metadata file`)
  process.exit(1)
}

let changed = 0
for (const file of files) {
  const name = basename(file)
  const hash = await sha512(file)
  const size = statSync(file).size
  const indexes = info.files.flatMap((f, i) => (f.url === name ? [i] : []))
  if (indexes.length === 0 && info.path !== name) {
    console.log(`${name}: not listed in ${basename(ymlPath)}, skipped`)
    continue
  }
  for (const i of indexes) {
    const entry = info.files[i]
    if (entry.sha512 === hash && entry.size === size) continue
    changed++
    doc.setIn(['files', i, 'sha512'], hash)
    doc.setIn(['files', i, 'size'], size)
  }
  if (info.path === name && info.sha512 !== hash) {
    changed++
    doc.set('sha512', hash)
  }
  rebuildBlockmap(file)
  console.log(`${name}: sha512 ${hash.slice(0, 16)}… size ${size}`)
}

if (changed > 0) {
  writeFileSync(ymlPath, doc.toString({ lineWidth: 0 }))
  console.log(`${basename(ymlPath)}: updated ${changed} field(s)`)
} else {
  console.log(`${basename(ymlPath)}: already in sync`)
}
