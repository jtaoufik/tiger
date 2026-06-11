/**
 * Git integration for collection folders. Shells out to the user's own git so
 * authentication (SSH agent, credential helpers) works exactly like their
 * terminal. Every function degrades gracefully when git is missing.
 */

import { execFile } from 'node:child_process'

export interface GitAvailability {
  ok: boolean
  version?: string
}

export interface GitStatus {
  isRepo: boolean
  branch?: string
  /** Files changed in the working tree (uncommitted). */
  dirtyCount: number
  changedFiles: Array<{ status: string; path: string }>
  /** Commits ahead of / behind the upstream. Zero when no upstream. */
  ahead: number
  behind: number
  hasUpstream: boolean
  /** Whether any remote is configured at all. */
  hasRemote: boolean
}

export interface GitActionResult {
  ok: boolean
  message: string
}

function run(
  args: string[],
  cwd?: string,
  timeoutMs = 15000
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      { cwd, timeout: timeoutMs, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
      (error, stdout, stderr) =>
        resolve({ ok: !error, stdout: stdout?.toString() ?? '', stderr: stderr?.toString() ?? '' })
    )
  })
}

export async function gitAvailable(): Promise<GitAvailability> {
  const result = await run(['--version'])
  return result.ok
    ? { ok: true, version: result.stdout.trim().replace('git version ', '') }
    : { ok: false }
}

export async function gitStatus(root: string): Promise<GitStatus> {
  const empty: GitStatus = {
    isRepo: false,
    dirtyCount: 0,
    changedFiles: [],
    ahead: 0,
    behind: 0,
    hasUpstream: false,
    hasRemote: false
  }

  const inside = await run(['rev-parse', '--is-inside-work-tree'], root)
  if (!inside.ok || inside.stdout.trim() !== 'true') return empty

  const branch = (await run(['rev-parse', '--abbrev-ref', 'HEAD'], root)).stdout.trim()

  const porcelain = await run(['status', '--porcelain'], root)
  const changedFiles = porcelain.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => ({ status: line.slice(0, 2).trim() || '??', path: line.slice(3) }))

  const remotes = await run(['remote'], root)
  const hasRemote = remotes.ok && remotes.stdout.trim().length > 0

  // NOTE: gitStatus must never run `git fetch`. The sidebar polls status every
  // 60s for every collection; fetching here would spawn a network call per
  // collection on every tick. ahead/behind is computed from refs already on
  // disk; call the separate gitFetch() from explicit refresh/sync only.

  let ahead = 0
  let behind = 0
  let hasUpstream = false
  const counts = await run(['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], root)
  if (counts.ok) {
    hasUpstream = true
    const [behindStr, aheadStr] = counts.stdout.trim().split(/\s+/)
    behind = Number(behindStr) || 0
    ahead = Number(aheadStr) || 0
  }

  return {
    isRepo: true,
    branch: branch || undefined,
    dirtyCount: changedFiles.length,
    changedFiles,
    ahead,
    behind,
    hasUpstream,
    hasRemote
  }
}

/**
 * Refresh remote-tracking refs so a subsequent gitStatus reports accurate
 * ahead/behind. Network-touching by design, so call it ONLY from explicit
 * user actions (refresh button, sync) — never from the status poll. Degrades
 * gracefully when offline or no remote is configured.
 */
export async function gitFetch(root: string): Promise<GitActionResult> {
  const remotes = await run(['remote'], root)
  if (!remotes.ok || remotes.stdout.trim().length === 0) {
    return { ok: true, message: 'No remote configured' }
  }
  const result = await run(['fetch', '--quiet'], root, 30000)
  return result.ok
    ? { ok: true, message: 'Refreshed from remote' }
    : { ok: false, message: result.stderr.trim().split('\n').pop() || 'Fetch failed' }
}

export async function gitDiff(root: string): Promise<string> {
  // HEAD diff covers staged + unstaged; untracked files get a synthetic entry.
  const diff = await run(['diff', 'HEAD'], root)
  const untracked = await run(['ls-files', '--others', '--exclude-standard'], root)
  const extras = untracked.stdout
    .split('\n')
    .filter(Boolean)
    .map((f) => `diff --git a/${f} b/${f}\nnew file (untracked)\n`)
    .join('')
  return diff.stdout + extras
}

export async function gitCommitAll(root: string, message: string): Promise<GitActionResult> {
  const add = await run(['add', '-A'], root)
  if (!add.ok) return { ok: false, message: add.stderr.trim() || 'git add failed' }
  const commit = await run(['commit', '-m', message || 'Update collection'], root)
  return commit.ok
    ? { ok: true, message: commit.stdout.split('\n')[0]?.trim() || 'Committed' }
    : { ok: false, message: commit.stderr.trim() || commit.stdout.trim() || 'Nothing to commit' }
}

export async function gitPull(root: string): Promise<GitActionResult> {
  const result = await run(['pull', '--ff-only'], root, 30000)
  return result.ok
    ? { ok: true, message: result.stdout.trim().split('\n').pop() || 'Up to date' }
    : { ok: false, message: result.stderr.trim().split('\n').pop() || 'Pull failed' }
}

export async function gitPush(root: string): Promise<GitActionResult> {
  const result = await run(['push'], root, 30000)
  const lastLine = (text: string) => text.trim().split('\n').pop() || ''
  return result.ok
    ? { ok: true, message: lastLine(result.stderr) || lastLine(result.stdout) || 'Pushed' }
    : { ok: false, message: lastLine(result.stderr) || 'Push failed' }
}

export async function gitInit(root: string): Promise<GitActionResult> {
  const result = await run(['init'], root)
  return result.ok
    ? { ok: true, message: 'Repository initialized' }
    : { ok: false, message: result.stderr.trim() || 'git init failed' }
}

/**
 * One-button sync for non-developers: share local changes and fetch the
 * team's, in plain language. Commit (if needed), refresh remote refs, then do a
 * MERGE pull (not --ff-only, which fails the moment both sides changed) and
 * push. A merge that hits conflicts is aborted so the folder is never left in a
 * silent half-merged state — the user gets a clear "resolve conflicts" message.
 */
export async function gitSync(root: string, message: string): Promise<GitActionResult> {
  const status = await gitStatus(root)
  if (!status.isRepo) return { ok: false, message: 'This folder is not set up for syncing yet' }
  if (status.dirtyCount > 0) {
    const commit = await gitCommitAll(root, message || 'Update collection')
    if (!commit.ok) return { ok: false, message: `Could not package your changes: ${commit.message}` }
  }
  if (status.hasUpstream) {
    // Explicit sync is the right place to touch the network.
    await gitFetch(root)
    // Merge pull tolerates both sides having changed; --no-rebase keeps the
    // simple merge model rather than rebasing local commits.
    const pull = await run(['pull', '--no-rebase'], root, 30000)
    if (!pull.ok) {
      // Leave nothing half-merged: abort the in-progress merge if there is one.
      await run(['merge', '--abort'], root)
      const detail = pull.stderr.trim().split('\n').pop() || pull.stdout.trim().split('\n').pop() || ''
      const conflicting = /conflict|merge|diverg/i.test(`${pull.stdout} ${pull.stderr}`)
      return {
        ok: false,
        message: conflicting
          ? 'Your changes and the team changes overlap. Open the folder in your editor to resolve the conflicts, then sync again.'
          : `Could not fetch team updates: ${detail || 'pull failed'}`
      }
    }
    const push = await gitPush(root)
    if (!push.ok) return { ok: false, message: `Could not share your changes: ${push.message}` }
    return { ok: true, message: 'Everything is in sync with your team' }
  }
  return { ok: true, message: 'Changes saved locally (no team remote configured)' }
}

/**
 * Connect the repository to a remote and publish the current branch. Used by
 * the friendly sync setup: paste a URL from GitHub/GitLab once, sync forever.
 */
export async function gitSetRemote(root: string, url: string): Promise<GitActionResult> {
  if (!/^(https?:\/\/|git@|ssh:\/\/)/.test(url.trim())) {
    return { ok: false, message: 'That does not look like a repository URL' }
  }
  const existing = await run(['remote'], root)
  const command = existing.stdout.split('\n').includes('origin')
    ? ['remote', 'set-url', 'origin', url.trim()]
    : ['remote', 'add', 'origin', url.trim()]
  const setRemote = await run(command, root)
  if (!setRemote.ok) return { ok: false, message: setRemote.stderr.trim() || 'Could not add remote' }

  const publish = await run(['push', '-u', 'origin', 'HEAD'], root, 30000)
  return publish.ok
    ? { ok: true, message: 'Connected: your collection is now shared' }
    : {
        ok: false,
        message:
          publish.stderr.trim().split('\n').pop() ||
          'Connected the remote, but publishing failed (check access rights)'
      }
}

export interface GitBranches {
  current: string
  all: string[]
}

export async function gitBranches(root: string): Promise<GitBranches> {
  const current = (await run(['rev-parse', '--abbrev-ref', 'HEAD'], root)).stdout.trim()
  const list = await run(['branch', '--format=%(refname:short)'], root)
  return {
    current,
    all: list.stdout.split('\n').map((b) => b.trim()).filter(Boolean)
  }
}

export async function gitCheckout(
  root: string,
  branch: string,
  create: boolean
): Promise<GitActionResult> {
  const result = await run(create ? ['checkout', '-b', branch] : ['checkout', branch], root)
  return result.ok
    ? { ok: true, message: create ? `Created and switched to ${branch}` : `Switched to ${branch}` }
    : { ok: false, message: result.stderr.trim().split('\n').pop() || 'Checkout failed' }
}

export interface GitCommit {
  hash: string
  subject: string
  author: string
  at: string
}

export async function gitLog(root: string, limit = 20): Promise<GitCommit[]> {
  const fmt = '%h%x1f%s%x1f%an%x1f%ar'
  const result = await run(['log', `-${limit}`, `--pretty=format:${fmt}`], root)
  if (!result.ok) return []
  return result.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, subject, author, at] = line.split('\x1f')
      return { hash, subject, author, at }
    })
}

/** Discard all uncommitted changes to tracked files (keeps untracked files). */
export async function gitDiscardAll(root: string): Promise<GitActionResult> {
  const reset = await run(['reset', '--', '.'], root)
  const restore = await run(['checkout', '--', '.'], root)
  return reset.ok && restore.ok
    ? { ok: true, message: 'Discarded uncommitted changes' }
    : { ok: false, message: restore.stderr.trim() || 'Could not discard changes' }
}

/** Clone a remote repository into `targetDir` (which must not yet exist). */
export async function gitClone(url: string, targetDir: string): Promise<GitActionResult> {
  if (!/^(https?:\/\/|git@|ssh:\/\/)/.test(url.trim())) {
    return { ok: false, message: 'That does not look like a repository URL' }
  }
  const result = await run(['clone', url.trim(), targetDir], undefined, 60000)
  return result.ok
    ? { ok: true, message: `Cloned into ${targetDir}` }
    : { ok: false, message: result.stderr.trim().split('\n').pop() || 'Clone failed' }
}

export function repoNameFromUrl(url: string): string {
  const last = url.trim().replace(/\/+$/, '').split(/[/:]/).pop() ?? 'collection'
  return last.replace(/\.git$/, '') || 'collection'
}
