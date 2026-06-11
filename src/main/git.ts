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
    hasUpstream: false
  }

  const inside = await run(['rev-parse', '--is-inside-work-tree'], root)
  if (!inside.ok || inside.stdout.trim() !== 'true') return empty

  const branch = (await run(['rev-parse', '--abbrev-ref', 'HEAD'], root)).stdout.trim()

  const porcelain = await run(['status', '--porcelain'], root)
  const changedFiles = porcelain.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => ({ status: line.slice(0, 2).trim() || '??', path: line.slice(3) }))

  // Quietly refresh remote refs so "behind" reflects reality; never block long
  // and never fail the status because the network or credentials are absent.
  await run(['fetch', '--quiet'], root, 8000)

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
    hasUpstream
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
