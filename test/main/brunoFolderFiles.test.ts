import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  dialog: {}
}))

import { readBrunoFolder } from '../../src/main/importers'
import { buildRequest } from '../../src/core/request'

describe('Bruno @file() paths', () => {
  it('reads a relative path from the collection folder, as Bruno does, and keeps an absolute one', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tiger-bruno-files-'))
    await mkdir(join(root, 'avatars'))
    await mkdir(join(root, 'users'))
    await writeFile(join(root, 'avatars', 'cat.png'), 'PNG')
    await writeFile(join(root, 'bruno.json'), '{"version":"1","name":"Files","type":"collection"}')
    await writeFile(
      join(root, 'users', 'upload.bru'),
      `meta {
  name: Upload
  type: http
  seq: 1
}

post {
  url: http://127.0.0.1:9/upload
  body: multipartForm
  auth: none
}

body:multipart-form {
  avatar: @file(avatars/cat.png)
  backup: @file(/var/backups/cat.png)
}
`
    )
    const result = await readBrunoFolder(root)
    const parts = buildRequest(result.requests[0].request).multipart ?? []
    // Relative to the collection root, not to users/ and not to Tiger's own working folder.
    expect(parts[0].value).toBe(join(root, 'avatars', 'cat.png'))
    expect(existsSync(parts[0].value)).toBe(true)
    expect(parts[1].value).toBe('/var/backups/cat.png')
    expect(result.warnings?.some((w) => w.message.includes(join(root, 'avatars', 'cat.png')))).toBe(true)
  })
})
