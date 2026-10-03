// @vitest-environment node
/**
 * Team Sync on folders and requests named in the languages Tiger speaks
 * (Requêtes, 用户...). git quotes such paths as "Requ\303\252tes/..." unless
 * told not to, and every per-file action then got a path that does not exist.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  gitConflicts,
  gitDiffFile,
  gitDiscard,
  gitRequestNames,
  gitStatus,
  gitSync,
  gitSyncResolve,
  gitUndoDiscard
} from '../../src/main/git'

// Inside the pre-commit hook git exports GIT_DIR and friends, which would
// point these scratch repos at the checkout (see gitSync.test.ts).
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

const tiger = (name: string, url: string): string =>
  `meta {\n  name: ${name}\n  seq: 1\n}\n\nget {\n  url: ${url}\n}\n`

async function identify(dir: string): Promise<void> {
  await sh(['config', 'user.email', 'test@tiger.local'], dir)
  await sh(['config', 'user.name', 'Tiger Test'], dir)
}

const LIST = 'Requêtes/lister.tiger'
const NEW = 'Requêtes/créer.tiger'
const USERS = '用户/获取.tiger'

let base = ''
beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'tiger-git-unicode-'))
})
afterAll(async () => {
  await rm(base, { recursive: true, force: true })
})

describe('changes in folders with non-ASCII names', () => {
  let dir = ''
  beforeAll(async () => {
    dir = join(base, 'changes')
    await mkdir(join(dir, 'Requêtes'), { recursive: true })
    await mkdir(join(dir, '用户'), { recursive: true })
    await writeFile(join(dir, LIST), tiger('Lister', '/items'))
    await writeFile(join(dir, USERS), tiger('Get user', '/users/1'))
    await sh(['init', '--initial-branch=main'], dir)
    await identify(dir)
    await sh(['add', '-A'], dir)
    await sh(['commit', '-m', 'seed'], dir)

    await writeFile(join(dir, LIST), tiger('Lister', '/items?page=2'))
    await writeFile(join(dir, NEW), tiger('Créer', '/items/new'))
    await writeFile(join(dir, USERS), tiger('Get user', '/users/2'))
  })

  it('lists the paths as they are on disk, and names each request', async () => {
    const status = await gitStatus(dir)
    expect(status.changedFiles.map((f) => f.path).sort()).toEqual([NEW, LIST, USERS].sort())
    expect(await gitRequestNames(dir, [LIST, NEW, USERS])).toEqual({
      [LIST]: 'Lister',
      [NEW]: 'Créer',
      [USERS]: 'Get user'
    })
  })

  it('diffs one of those files at a time', async () => {
    const edited = await gitDiffFile(dir, LIST)
    expect(edited).toContain('-  url: /items')
    expect(edited).toContain('+  url: /items?page=2')
    expect(edited).not.toContain('/users/')
    expect(await gitDiffFile(dir, NEW)).toContain('+  name: Créer')
  })

  it('discards one of those files only, and undo brings it back', async () => {
    const result = await gitDiscard(dir, [LIST])
    expect(result.ok).toBe(true)
    expect(await readFile(join(dir, LIST), 'utf8')).toContain('url: /items\n')
    expect(await readFile(join(dir, USERS), 'utf8')).toContain('/users/2')
    expect((await gitStatus(dir)).changedFiles.map((f) => f.path).sort()).toEqual([NEW, USERS].sort())

    expect((await gitUndoDiscard(dir, result.undoToken!)).ok).toBe(true)
    expect(await readFile(join(dir, LIST), 'utf8')).toContain('/items?page=2')
  })

  it('lists a renamed request under its new name', async () => {
    await sh(['add', '-A'], dir)
    await sh(['commit', '-m', 'edits'], dir)
    await sh(['mv', LIST, 'Requêtes/liste complète.tiger'], dir)
    const status = await gitStatus(dir)
    expect(status.changedFiles).toEqual([{ status: 'R', path: 'Requêtes/liste complète.tiger' }])
  })
})

describe('a conflict on a request in a non-ASCII folder', () => {
  let mine = ''
  let theirs = ''
  beforeAll(async () => {
    const bare = join(base, 'remote.git')
    await sh(['init', '--bare', '--initial-branch=main', bare])
    mine = join(base, 'c-mine')
    theirs = join(base, 'c-theirs')
    await sh(['clone', bare, mine])
    await sh(['clone', bare, theirs])
    for (const clone of [mine, theirs]) await identify(clone)
    await mkdir(join(mine, 'Requêtes'))
    await writeFile(join(mine, LIST), tiger('Lister', '/items'))
    await sh(['add', '-A'], mine)
    await sh(['commit', '-m', 'seed'], mine)
    await sh(['push', '-u', 'origin', 'main'], mine)
    await sh(['pull'], theirs)

    await writeFile(join(theirs, LIST), tiger('Lister', '/team-items'))
    expect((await gitSync(theirs, 'team edit')).ok).toBe(true)
    await writeFile(join(mine, LIST), tiger('Lister', '/my-items'))
    expect((await gitSync(mine, 'my edit')).conflict).toBe(true)
  }, 30000)

  it('names the request with both versions', async () => {
    const [conflict, ...others] = await gitConflicts(mine)
    expect(others).toEqual([])
    expect(conflict).toMatchObject({ path: LIST, name: 'Lister' })
    expect(conflict.mine).toContain('/my-items')
    expect(conflict.theirs).toContain('/team-items')
  }, 30000)

  it('keeps the chosen version, never a file full of conflict markers', async () => {
    const result = await gitSyncResolve(mine, 'theirs', '', { [LIST]: 'mine' })
    expect(result.ok).toBe(true)
    const text = await readFile(join(mine, LIST), 'utf8')
    expect(text).toContain('/my-items')
    expect(text).not.toMatch(/^(<<<<<<<|=======|>>>>>>>)/m)
    expect((await gitStatus(mine)).dirtyCount).toBe(0)
  }, 30000)
})
