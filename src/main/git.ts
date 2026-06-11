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

  // Quietly refresh remote refs so "behind" reflects reality; never block long
  // and never fail the status because the network or credentials are absent.
  if (hasRemote) await run(['fetch', '--quiet'], root, 8000)

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
 * team's, in plain language. Commit (if needed) then pull --ff-only then push.
 */
export async function gitSync(root: string, message: string): Promise<GitActionResult> {
  const status = await gitStatus(root)
  if (!status.isRepo) return { ok: false, message: 'This folder is not set up for syncing yet' }
  if (status.dirtyCount > 0) {
    const commit = await gitCommitAll(root, message || 'Update collection')
    if (!commit.ok) return { ok: false, message: `Could not package your changes: ${commit.message}` }
  }
  if (status.hasUpstream) {
    const pull = await gitPull(root)
    if (!pull.ok) return { ok: false, message: `Could not fetch team updates: ${pull.message}` }
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
