// @vitest-environment node
/**
 * Two ways a git action could reach beyond the collection: a collection folder
 * inside a larger repository (every pathspec-less command then works on the
 * whole project), and a branch name git reads as an option or a path.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  gitCheckout,
  gitCommitAll,
  gitDiscard,
  gitInit,
  gitStatus,
  gitSync
} from '../../src/main/git'

for (const key of Object.keys(process.env)) {
  if (key.startsWith('GIT_')) delete process.env[key]
}

function sh(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd }, (err, stdout, stderr) =>
      err ? reject(new Error(stderr || String(err))) : resolve(stdout)
    )
  })
}

async function identify(dir: string): Promise<void> {
  await sh(['config', 'user.email', 'test@tiger.local'], dir)
  await sh(['config', 'user.name', 'Tiger Test'], dir)
}

const tiger = (name: string): string => `meta {\n  name: ${name}\n}\n\nget {\n  url: /x\n}\n`

let base = ''
beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'tiger-guards-'))
})
afterAll(async () => {
  await rm(base, { recursive: true, force: true })
})

describe('a collection folder inside a larger repository', () => {
  let project = ''
  let api = ''
  beforeAll(async () => {
    project = join(base, 'project')
    api = join(project, 'api')
    await mkdir(api, { recursive: true })
    await sh(['init', '--initial-branch=main'], project)
    await identify(project)
    await writeFile(join(project, 'README.md'), 'the project\n')
    await sh(['add', '-A'], project)
    await sh(['commit', '-m', 'seed'], project)
    // The user's own unsaved work, outside the collection.
    await writeFile(join(project, 'notes.txt'), 'secret draft\n')
    await writeFile(join(project, 'README.md'), 'the project, edited\n')
    await writeFile(join(api, 'get.tiger'), tiger('Get'))
  })

  it('is reported as not tracked, naming the repository it sits in', async () => {
    const status = await gitStatus(api)
    expect(status.isRepo).toBe(false)
    expect(status.dirtyCount).toBe(0)
    expect(await realpath(status.nestedIn!)).toBe(await realpath(project))
  })

  it('refuses to start tracking, save, discard or sync, and leaves the project untouched', async () => {
    expect(await gitInit(api)).toMatchObject({ ok: false, code: 'nested-repo' })
    await expect(access(join(api, '.git'))).rejects.toThrow()
    expect(await gitCommitAll(api, 'oops')).toMatchObject({ ok: false, code: 'nested-repo' })
    expect(await gitDiscard(api)).toMatchObject({ ok: false, code: 'nested-repo' })
    expect(await gitSync(api, 'oops')).toMatchObject({ ok: false, code: 'nested-repo' })

    // Nothing staged or committed, the draft still on disk and still unsaved.
    expect(await sh(['rev-list', '--count', 'HEAD'], project)).toBe('1\n')
    expect(await sh(['diff', '--cached', '--name-only'], project)).toBe('')
    expect(await readFile(join(project, 'notes.txt'), 'utf8')).toBe('secret draft\n')
    expect(await readFile(join(project, 'README.md'), 'utf8')).toBe('the project, edited\n')
    expect((await sh(['status', '--porcelain'], project)).split('\n').filter(Boolean).sort()).toEqual([
      ' M README.md',
      '?? api/',
      '?? notes.txt'
    ])
  })

  it('the repository folder itself is tracked as before', async () => {
    const status = await gitStatus(project)
    expect(status.isRepo).toBe(true)
    expect(status.nestedIn).toBeUndefined()
  })
})

describe('switching branches', () => {
  let dir = ''
  beforeAll(async () => {
    dir = join(base, 'branches')
    await mkdir(dir)
    expect((await gitInit(dir)).ok).toBe(true)
    await identify(dir)
    await writeFile(join(dir, 'a.tiger'), tiger('A'))
    await sh(['add', '-A'], dir)
    await sh(['commit', '-m', 'seed'], dir)
    await writeFile(join(dir, 'a.tiger'), tiger('A edited'))
  })

  it.each(['-f', '.', '--orphan', 'a..b', ''])('refuses %j as a branch name and keeps unsaved edits', async (name) => {
    const result = await gitCheckout(dir, name, false)
    expect(result.ok).toBe(false)
    expect(await readFile(join(dir, 'a.tiger'), 'utf8')).toContain('A edited')
    expect((await gitCheckout(dir, name, true)).ok).toBe(false)
  })

  it('creates and switches to a valid branch', async () => {
    expect((await gitCheckout(dir, 'feature/x', true)).ok).toBe(true)
    expect((await sh(['rev-parse', '--abbrev-ref', 'HEAD'], dir)).trim()).toBe('feature/x')
    expect((await gitCheckout(dir, 'main', false)).ok).toBe(true)
    expect((await sh(['rev-parse', '--abbrev-ref', 'HEAD'], dir)).trim()).toBe('main')
    expect(await readFile(join(dir, 'a.tiger'), 'utf8')).toContain('A edited')
  })
})
