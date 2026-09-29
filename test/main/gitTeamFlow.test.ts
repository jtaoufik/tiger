import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  classifyGitError,
  gitConflicts,
  gitDiffFile,
  gitDiscard,
  gitInit,
  gitRequestNames,
  gitSetIdentity,
  gitSetRemote,
  gitStatus,
  gitSync,
  gitSyncResolve,
  gitUndoDiscard,
  requestNameFromText
} from '../../src/main/git'

// Same scrub as gitSync.test.ts: inside the pre-commit hook git exports
// GIT_DIR and friends, which would point these scratch repos at the checkout.
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

/** Identity is always repo-local: tests never touch global or checkout config. */
async function identify(dir: string): Promise<void> {
  await sh(['config', 'user.email', 'test@tiger.local'], dir)
  await sh(['config', 'user.name', 'Tiger Test'], dir)
}

let base = ''
beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'tiger-team-'))
})
afterAll(async () => {
  await rm(base, { recursive: true, force: true })
})

async function freshRemote(name: string): Promise<string> {
  const bare = join(base, `${name}.git`)
  await sh(['init', '--bare', '--initial-branch=main', bare])
  return bare
}

describe('classifyGitError', () => {
  it('maps git output to a code the UI can act on', () => {
    expect(
      classifyGitError(
        "fatal: could not read Username for 'https://github.com': terminal prompts disabled"
      )
    ).toBe('auth-required')
    expect(classifyGitError('git@github.com: Permission denied (publickey).')).toBe('ssh-key')
    expect(classifyGitError('fatal: Authentication failed for x')).toBe('auth-failed')
    expect(classifyGitError('remote: Repository not found.')).toBe('not-found')
    expect(classifyGitError('Could not resolve host: x.invalid')).toBe('network')
    expect(classifyGitError('*** Please tell me who you are.')).toBe('identity')
    expect(classifyGitError(' ! [rejected]        main -> main (fetch first)')).toBe('rejected')
    expect(classifyGitError('error: src refspec HEAD does not match any')).toBe('no-commits')
    expect(classifyGitError('fatal: something else')).toBeUndefined()
  })
})

describe('requestNameFromText', () => {
  it('reads the meta name, falling back to the file name', () => {
    expect(requestNameFromText(tiger('Get user', '/u'), 'users/get-user.tiger')).toBe('Get user')
    expect(requestNameFromText(null, 'users/get-user.tiger')).toBe('get-user')
    expect(requestNameFromText('get {\n}\n', 'a/b.tiger')).toBe('b')
  })
})

describe('share a collection: track, connect, first sync', () => {
  it('publishes a never-committed collection on the first sync (old dead end)', async () => {
    const bare = await freshRemote('share')
    const dir = join(base, 'share')
    await mkdir(dir)
    await writeFile(join(dir, 'get-user.tiger'), tiger('Get user', '/users/1'))
    expect((await gitInit(dir)).ok).toBe(true)
    await identify(dir)

    const connected = await gitSetRemote(dir, `file://${bare}`)
    expect(connected.ok).toBe(true)
    expect(connected.remoteHasContent).toBe(false)

    const synced = await gitSync(dir, 'Add Get user')
    expect(synced.ok).toBe(true)
    expect(synced.sent).toBe(1)
    expect((await sh(['log', '--format=%s', 'main'], bare)).trim()).toBe('Add Get user')
    const status = await gitStatus(dir)
    expect(status.hasUpstream).toBe(true)
    expect(status.dirtyCount).toBe(0)
  }, 30000)

  it('leaves no remote behind when the repository cannot be reached', async () => {
    const dir = join(base, 'unreachable')
    await mkdir(dir)
    await gitInit(dir)
    const result = await gitSetRemote(dir, `file://${join(base, 'missing.git')}`)
    expect(result.ok).toBe(false)
    expect((await gitStatus(dir)).hasRemote).toBe(false)
  }, 30000)

  it('saves the name and email in this repository only', async () => {
    const dir = join(base, 'identity')
    await mkdir(dir)
    await gitInit(dir)
    expect((await gitSetIdentity(dir, 'Pat Owner', 'nope')).ok).toBe(false)
    expect((await gitSetIdentity(dir, 'Pat Owner', 'pat@example.com')).ok).toBe(true)
    expect((await sh(['config', '--local', 'user.email'], dir)).trim()).toBe('pat@example.com')
  })
})

describe('changes, per-file diff, discard with undo', () => {
  let dir = ''
  beforeAll(async () => {
    dir = join(base, 'changes')
    await mkdir(join(dir, 'users'), { recursive: true })
    await writeFile(join(dir, 'users', 'get-user.tiger'), tiger('Get user', '/users/1'))
    await writeFile(join(dir, 'users', 'delete-user.tiger'), tiger('Delete user', '/users/1'))
    await gitInit(dir)
    await identify(dir)
    await sh(['add', '-A'], dir)
    await sh(['commit', '-m', 'seed'], dir)
  })

  async function makeChanges(): Promise<void> {
    await writeFile(join(dir, 'users', 'get-user.tiger'), tiger('Get user', '/users/{{id}}'))
    await rm(join(dir, 'users', 'delete-user.tiger'))
    await mkdir(join(dir, 'posts'), { recursive: true })
    await writeFile(join(dir, 'posts', 'create-post.tiger'), tiger('Create post', '/posts'))
  }

  it('lists each new file and names every changed request, deleted ones included', async () => {
    await makeChanges()
    const status = await gitStatus(dir)
    expect(status.changedFiles.map((f) => f.path).sort()).toEqual([
      'posts/create-post.tiger',
      'users/delete-user.tiger',
      'users/get-user.tiger'
    ])
    const names = await gitRequestNames(
      dir,
      status.changedFiles.map((f) => f.path)
    )
    expect(names).toEqual({
      'posts/create-post.tiger': 'Create post',
      'users/delete-user.tiger': 'Delete user',
      'users/get-user.tiger': 'Get user'
    })
  })

  it('diffs one file at a time, new files as all-added', async () => {
    const edited = await gitDiffFile(dir, 'users/get-user.tiger')
    expect(edited).toContain('-  url: /users/1')
    expect(edited).toContain('+  url: /users/{{id}}')
    expect(edited).not.toContain('create-post')
    const added = await gitDiffFile(dir, 'posts/create-post.tiger')
    expect(added).toContain('+  name: Create post')
  })

  it('discards one request only', async () => {
    const result = await gitDiscard(dir, ['users/get-user.tiger'])
    expect(result.ok).toBe(true)
    expect(await readFile(join(dir, 'users', 'get-user.tiger'), 'utf8')).toContain('/users/1')
    expect((await gitStatus(dir)).dirtyCount).toBe(2)
    expect((await gitUndoDiscard(dir, result.undoToken!)).ok).toBe(true)
    expect((await gitStatus(dir)).dirtyCount).toBe(3)
  })

  it('discards everything, new files too, and undo brings it all back', async () => {
    const result = await gitDiscard(dir)
    expect(result.ok).toBe(true)
    expect(result.undoToken).toMatch(/^[0-9a-f]{40}/)
    expect((await gitStatus(dir)).dirtyCount).toBe(0)
    await expect(access(join(dir, 'posts', 'create-post.tiger'))).rejects.toThrow()

    const undo = await gitUndoDiscard(dir, result.undoToken!)
    expect(undo.ok).toBe(true)
    expect((await gitStatus(dir)).dirtyCount).toBe(3)
    expect(await readFile(join(dir, 'posts', 'create-post.tiger'), 'utf8')).toContain('Create post')
    // The undo entry is consumed, not left lying around.
    expect((await sh(['stash', 'list'], dir)).trim()).toBe('')
  })

  it('refuses to discard before any version exists', async () => {
    const empty = join(base, 'no-commit')
    await mkdir(empty)
    await gitInit(empty)
    await writeFile(join(empty, 'a.tiger'), 'x\n')
    const result = await gitDiscard(empty)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('no-commits')
  })
})

describe('conflicts: list them, then resolve per request', () => {
  let mine = ''
  let theirs = ''
  beforeAll(async () => {
    const bare = await freshRemote('conflict')
    mine = join(base, 'c-mine')
    theirs = join(base, 'c-theirs')
    await sh(['clone', bare, mine])
    await sh(['clone', bare, theirs])
    for (const clone of [mine, theirs]) await identify(clone)
    await writeFile(join(mine, 'a.tiger'), tiger('Alpha', '/a'))
    await writeFile(join(mine, 'b.tiger'), tiger('Beta', '/b'))
    await sh(['add', '-A'], mine)
    await sh(['commit', '-m', 'seed'], mine)
    await sh(['push', '-u', 'origin', 'main'], mine)
    await sh(['pull'], theirs)
  }, 30000)

  it('reports counts on a clean sync', async () => {
    await writeFile(join(theirs, 'b.tiger'), tiger('Beta', '/b?v=1'))
    expect((await gitSync(theirs, 'team')).sent).toBe(1)
    const synced = await gitSync(mine, '')
    expect(synced.ok).toBe(true)
    expect(synced.received).toBe(1)
    expect(synced.sent).toBe(0)
  }, 30000)

  it('names each overlapping request with both versions', async () => {
    await writeFile(join(theirs, 'a.tiger'), tiger('Alpha', '/team-a'))
    await writeFile(join(theirs, 'b.tiger'), tiger('Beta', '/team-b'))
    expect((await gitSync(theirs, 'team edit')).ok).toBe(true)
    await writeFile(join(mine, 'a.tiger'), tiger('Alpha', '/mine-a'))
    await writeFile(join(mine, 'b.tiger'), tiger('Beta', '/mine-b'))
    const result = await gitSync(mine, 'my edit')
    expect(result.conflict).toBe(true)

    const conflicts = await gitConflicts(mine)
    expect(conflicts.map((c) => c.path).sort()).toEqual(['a.tiger', 'b.tiger'])
    const alpha = conflicts.find((c) => c.path === 'a.tiger')!
    expect(alpha.name).toBe('Alpha')
    expect(alpha.mine).toContain('/mine-a')
    expect(alpha.theirs).toContain('/team-a')
  }, 30000)

  it('keeps mine for one request and theirs for the other', async () => {
    const result = await gitSyncResolve(mine, 'mine', '', {
      'a.tiger': 'mine',
      'b.tiger': 'theirs'
    })
    expect(result.ok).toBe(true)
    expect(await readFile(join(mine, 'a.tiger'), 'utf8')).toContain('/mine-a')
    expect(await readFile(join(mine, 'b.tiger'), 'utf8')).toContain('/team-b')
    expect((await gitStatus(mine)).dirtyCount).toBe(0)
    const pulled = await gitSync(theirs, '')
    expect(pulled.ok).toBe(true)
    expect(await readFile(join(theirs, 'a.tiger'), 'utf8')).toContain('/mine-a')
  }, 30000)
})
