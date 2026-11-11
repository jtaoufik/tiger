import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * scripts/refresh-update-metadata.mjs runs at the end of the release job,
 * after notarization and SignPath rewrite the installers: it re-hashes them
 * in latest*.yml and rebuilds their .blockmap. It leans on electron-builder's
 * block map code, which moved from a Go binary to JavaScript in version 26;
 * the macOS release job failed on that until this test existed.
 */
const script = resolve(__dirname, '../../scripts/refresh-update-metadata.mjs')
let dir: string

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('refresh-update-metadata', () => {
  it('re-hashes a changed installer in latest-mac.yml and rebuilds its block map', () => {
    dir = mkdtempSync(join(tmpdir(), 'tiger-meta-'))
    const dmg = join(dir, 'Tiger-0.8.1-mac-arm64.dmg')
    const bytes = Buffer.alloc(200_000)
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7919) & 0xff
    writeFileSync(dmg, bytes)
    writeFileSync(`${dmg}.blockmap`, 'stale')
    const yml = join(dir, 'latest-mac.yml')
    writeFileSync(
      yml,
      [
        'version: 0.8.1',
        'files:',
        '  - url: Tiger-0.8.1-mac-arm64.dmg',
        '    sha512: stale',
        '    size: 1',
        'path: Tiger-0.8.1-mac-arm64.dmg',
        'sha512: stale',
        "releaseDate: '2026-11-04T00:00:00.000Z'",
        ''
      ].join('\n')
    )

    const out = execFileSync(process.execPath, [script, yml, dmg], { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } })
    expect(out).toContain('rebuilt Tiger-0.8.1-mac-arm64.dmg.blockmap')
    expect(out).toContain('updated 2 field(s)')

    const expected = createHash('sha512').update(bytes).digest('base64')
    const text = readFileSync(yml, 'utf8')
    expect(text).toContain(`    sha512: ${expected}`)
    expect(text).toContain(`    size: ${bytes.length}`)
    expect(text).toContain(`\nsha512: ${expected}`)
    // The quoted release date must survive untouched (a YAML timestamp would break electron-updater).
    expect(text).toContain("releaseDate: '2026-11-04T00:00:00.000Z'")

    // electron-updater reads a gzipped JSON block map (version 2) with the file's chunks.
    const map = JSON.parse(gunzipSync(readFileSync(`${dmg}.blockmap`)).toString('utf8'))
    expect(map.version).toBe('2')
    expect(map.files[0].checksums.length).toBeGreaterThan(1)
  })
})
