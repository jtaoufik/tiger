import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gitSync, gitSyncResolve } from '../../src/main/git'

function sh(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd }, (err, stdout, stderr) =>
      err ? reject(new Error(stderr || String(err))) : resolve(stdout)
    )
  })
}

let base = ''
let bare = ''
let mine = ''
let theirs = ''

/** Two clones of one bare repo: `mine` is the product owner, `theirs` the team. */
beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'tiger-git-'))
  bare = join(base, 'remote.git')
  mine = join(base, 'mine')
  theirs = join(base, 'theirs')
  await sh(['init', '--bare', '--initial-branch=main', bare])
  await sh(['clone', bare, mine])
  await sh(['clone', bare, theirs])
  for (const clone of [mine, theirs]) {
    await sh(['config', 'user.email', 'test@tiger.local'], clone)
    await sh(['config', 'user.name', 'Tiger Test'], clone)
  }
  await writeFile(join(mine, 'request.tiger'), 'original\n')
  await sh(['add', '-A'], mine)
  await sh(['commit', '-m', 'seed'], mine)
  await sh(['push', '-u', 'origin', 'main'], mine)
  await sh(['pull'], theirs)
}, 30000)

afterAll(async () => {
  await rm(base, { recursive: true, force: true })
})

async function makeConflict(mineText: string, theirsText: string): Promise<void> {
  await writeFile(join(theirs, 'request.tiger'), theirsText)
  const shared = await gitSync(theirs, 'team edit')
  expect(shared.ok).toBe(true)
  await writeFile(join(mine, 'request.tiger'), mineText)
}

describe('gitSync + gitSyncResolve (product-owner conflict flow)', () => {
  it('reports overlapping changes as a structured conflict, not a half-merge', async () => {
    await makeConflict('mine v1\n', 'theirs v1\n')
    const result = await gitSync(mine, 'my edit')
    expect(result.ok).toBe(false)
    expect(result.conflict).toBe(true)
    // The merge was aborted: no conflict markers left on disk.
    const text = await readFile(join(mine, 'request.tiger'), 'utf8')
    expect(text).not.toContain('<<<<<<<')
  }, 30000)

  it("'theirs' finishes the sync with the team's version where they overlap", async () => {
    const result = await gitSyncResolve(mine, 'theirs', 'my edit')
    expect(result.ok).toBe(true)
    expect(await readFile(join(mine, 'request.tiger'), 'utf8')).toBe('theirs v1\n')
    // And the result was pushed: the other clone syncs cleanly to the same text.
    const pulled = await gitSync(theirs, '')
    expect(pulled.ok).toBe(true)
    expect(await readFile(join(theirs, 'request.tiger'), 'utf8')).toBe('theirs v1\n')
  }, 30000)

  it("'mine' finishes the sync with my version where they overlap", async () => {
    await makeConflict('mine v2\n', 'theirs v2\n')
    const conflicted = await gitSync(mine, 'my edit')
    expect(conflicted.conflict).toBe(true)
    const result = await gitSyncResolve(mine, 'mine', 'my edit')
    expect(result.ok).toBe(true)
    expect(await readFile(join(mine, 'request.tiger'), 'utf8')).toBe('mine v2\n')
    const pulled = await gitSync(theirs, '')
    expect(pulled.ok).toBe(true)
    expect(await readFile(join(theirs, 'request.tiger'), 'utf8')).toBe('mine v2\n')
  }, 30000)
})
