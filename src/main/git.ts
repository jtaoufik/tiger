/**
 * Git integration for collection folders. Shells out to the user's own git so
 * authentication (SSH agent, credential helpers) works exactly like their
 * terminal. Every function degrades gracefully when git is missing.
 *
 * Wording rule: messages returned here reach people who have never used git.
 * Say what happened in plain words; the renderer adds the git term in small
 * print where an expert wants it.
 */

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { MessageKey } from '../core/i18n'
import { mainT } from './i18n'

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

/**
 * Machine-readable reason for a failure, so the renderer can show the right
 * help (token, SSH key, Git Credential Manager, identity form) instead of a
 * sentence it would have to parse.
 */
export type GitErrorCode =
  | 'auth-required'
  | 'ssh-key'
  | 'auth-failed'
  | 'not-found'
  | 'network'
  | 'identity'
  | 'rejected'
  | 'no-commits'

export interface GitActionResult {
  ok: boolean
  message: string
  /**
   * The sync stopped because local and team changes overlap. The UI offers
   * "keep mine" / "take theirs" and calls gitSyncResolve — never ask the user
   * to resolve conflicts by hand.
   */
  conflict?: boolean
  /** Why it failed, when git's output matched a known cause. */
  code?: GitErrorCode
  /** Sync: versions received from the team / sent to the team. */
  received?: number
  sent?: number
  /** Discard: pass to gitUndoDiscard to bring the changes back. */
  undoToken?: string
  /** Connect: the shared repository already holds commits. */
  remoteHasContent?: boolean
}

/** Sync progress, reported while a long network call runs. */
export type SyncPhase = 'saving' | 'receiving' | 'sending'

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

const lastLine = (text: string): string => text.trim().split('\n').pop()?.trim() || ''

/**
 * Network git commands run with GIT_TERMINAL_PROMPT=0 so the Electron process
 * never hangs on a hidden prompt. That makes the typical "no credentials"
 * failure surface as a cryptic "terminal prompts disabled" line. Classify the
 * common auth, host, access and setup errors so the UI can say what to do.
 */
export function classifyGitError(stderr: string): GitErrorCode | undefined {
  const text = stderr.toLowerCase()
  if (/terminal prompts disabled|could not read username|could not read password/.test(text)) {
    return 'auth-required'
  }
  if (/permission denied \(publickey\)|host key verification failed/.test(text)) return 'ssh-key'
  if (/authentication failed|http basic: access denied|invalid username or password/.test(text)) {
    return 'auth-failed'
  }
  if (/repository not found|remote: not found|does not appear to be a git repository/.test(text)) {
    return 'not-found'
  }
  if (
    /could not resolve host|name or service not known|temporary failure in name resolution|failed to connect|network is unreachable|connection timed out/.test(
      text
    )
  ) {
    return 'network'
  }
  if (/please tell me who you are|unable to auto-detect email|empty ident name/.test(text)) {
    return 'identity'
  }
  if (/updates were rejected|\[rejected\]|non-fast-forward|fetch first/.test(text)) return 'rejected'
  if (/src refspec .* does not match any|does not have any commits yet|initial commit yet/.test(text)) {
    return 'no-commits'
  }
  return undefined
}

const ERROR_KEYS: Record<GitErrorCode, MessageKey> = {
  'auth-required': 'team.git.err.authRequired',
  'ssh-key': 'team.git.err.sshKey',
  'auth-failed': 'team.git.err.authFailed',
  'not-found': 'team.git.err.notFound',
  network: 'team.git.err.network',
  identity: 'team.git.err.identity',
  rejected: 'team.git.err.rejected',
  'no-commits': 'team.git.err.noCommits'
}

/** Plain-language message for git's stderr, or `fallback` when unrecognised. */
export function translateGitError(stderr: string, fallback: string): string {
  const code = classifyGitError(stderr)
  return code ? mainT(ERROR_KEYS[code]) : fallback
}

/**
 * A failed action. `prefixKey` wraps the detail in a sentence such as
 * "Could not share your changes: {detail}" (one message, so word order can differ).
 */
function failure(stderr: string, fallback: string, prefixKey?: MessageKey): GitActionResult {
  const code = classifyGitError(stderr)
  const detail = code ? mainT(ERROR_KEYS[code]) : fallback
  return { ok: false, code, message: prefixKey ? mainT(prefixKey, { detail }) : detail }
}

const wrap = (key: MessageKey, detail: string): string => mainT(key, { detail })

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

  // -uall lists each new file (not just its folder), so the UI can name it.
  const porcelain = await run(['status', '--porcelain', '-uall'], root)
  const changedFiles = porcelain.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => ({ status: line.slice(0, 2).trim() || '??', path: unquote(line.slice(3)) }))

  const remotes = await run(['remote'], root)
  const hasRemote = remotes.ok && remotes.stdout.trim().length > 0

  // NOTE: gitStatus must never run `git fetch`. The sidebar polls status every
  // 60s for every collection; fetching here would spawn a network call per
  // collection on every tick. ahead/behind is computed from refs already on
  // disk; call the separate gitFetch() from explicit refresh/sync only.
  const counts = await aheadBehind(root)

  return {
    isRepo: true,
    branch: branch || undefined,
    dirtyCount: changedFiles.length,
    changedFiles,
    ahead: counts?.ahead ?? 0,
    behind: counts?.behind ?? 0,
    hasUpstream: counts !== null,
    hasRemote
  }
}

/** Porcelain quotes paths with spaces or non-ASCII; strip that for display. */
function unquote(path: string): string {
  const renamed = path.includes(' -> ') ? path.split(' -> ').pop()! : path
  return renamed.startsWith('"') && renamed.endsWith('"') ? renamed.slice(1, -1) : renamed
}

async function aheadBehind(root: string): Promise<{ ahead: number; behind: number } | null> {
  const counts = await run(['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], root)
  if (!counts.ok) return null
  const [behindStr, aheadStr] = counts.stdout.trim().split(/\s+/)
  return { ahead: Number(aheadStr) || 0, behind: Number(behindStr) || 0 }
}

async function firstRemote(root: string): Promise<string | null> {
  const remotes = await run(['remote'], root)
  const names = remotes.stdout.split('\n').map((r) => r.trim()).filter(Boolean)
  return names.includes('origin') ? 'origin' : (names[0] ?? null)
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
    return { ok: true, message: mainT('team.git.noRemote') }
  }
  const result = await run(['fetch', '--quiet'], root, 30000)
  return result.ok
    ? { ok: true, message: mainT('team.git.refreshed') }
    : failure(result.stderr, lastLine(result.stderr) || mainT('team.git.fetchFailed'))
}

export async function gitDiff(root: string): Promise<string> {
  // HEAD diff covers staged + unstaged; untracked files get a synthetic entry.
  const diff = await run(['diff', 'HEAD'], root)
  const untracked = await run(['ls-files', '--others', '--exclude-standard'], root)
  const extras = await Promise.all(
    untracked.stdout
      .split('\n')
      .filter(Boolean)
      .map((f) => newFileDiff(root, f))
  )
  return diff.stdout + extras.join('')
}

async function newFileDiff(root: string, path: string): Promise<string> {
  const text = await readFile(join(root, path), 'utf8').catch(() => '')
  const lines = text.replace(/\n$/, '').split('\n')
  return (
    `diff --git a/${path} b/${path}\nnew file\n--- /dev/null\n+++ b/${path}\n` +
    `@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join('\n')}\n`
  )
}

/** Diff of one changed file against the last saved version (new files: all added). */
export async function gitDiffFile(root: string, path: string): Promise<string> {
  const tracked = await run(['ls-files', '--error-unmatch', '--', path], root)
  if (!tracked.ok) return newFileDiff(root, path)
  const hasHead = await run(['rev-parse', '--verify', '--quiet', 'HEAD'], root)
  const diff = await run(hasHead.ok ? ['diff', 'HEAD', '--', path] : ['diff', '--cached', '--', path], root)
  return diff.stdout
}

/** The request name from a .tiger file's `meta { name: … }`, else the file name. */
export function requestNameFromText(text: string | null, path: string): string {
  const meta = text?.match(/meta\s*\{([^}]*)\}/)
  const name = meta?.[1].match(/^\s*name:\s*(.+?)\s*$/m)?.[1]
  return name || basename(path).replace(/\.tiger$/, '')
}

/**
 * Request names for changed paths, so the UI lists "Get user" instead of
 * users/get-user.tiger. Deleted files are read from the last saved version.
 */
export async function gitRequestNames(root: string, paths: string[]): Promise<Record<string, string>> {
  const entries = await Promise.all(
    paths.map(async (path) => {
      let text: string | null = await readFile(join(root, path), 'utf8').catch(() => null)
      if (text === null) {
        const shown = await run(['show', `HEAD:${path}`], root)
        text = shown.ok ? shown.stdout : null
      }
      return [path, requestNameFromText(text, path)] as const
    })
  )
  return Object.fromEntries(entries)
}

export async function gitCommitAll(root: string, message: string): Promise<GitActionResult> {
  const add = await run(['add', '-A'], root)
  if (!add.ok) return { ok: false, message: add.stderr.trim() || mainT('team.git.addFailed') }
  const commit = await run(['commit', '-m', message || 'Update collection'], root)
  return commit.ok
    ? { ok: true, message: commit.stdout.split('\n')[0]?.trim() || mainT('team.git.committed') }
    : failure(commit.stderr, commit.stderr.trim() || commit.stdout.trim() || mainT('team.git.nothingToCommit'))
}

/** Set the name and email git records on versions saved in this collection only. */
export async function gitSetIdentity(root: string, name: string, email: string): Promise<GitActionResult> {
  if (!name.trim() || !/^[^\s@]+@[^\s@]+$/.test(email.trim())) {
    return { ok: false, message: mainT('team.git.identityInvalid') }
  }
  const setName = await run(['config', 'user.name', name.trim()], root)
  const setEmail = await run(['config', 'user.email', email.trim()], root)
  return setName.ok && setEmail.ok
    ? { ok: true, message: mainT('team.git.identitySaved', { name: name.trim() }) }
    : { ok: false, message: lastLine(setName.stderr || setEmail.stderr) || mainT('team.git.saveNameFailed') }
}

export async function gitPull(root: string): Promise<GitActionResult> {
  const result = await run(['pull', '--ff-only'], root, 30000)
  return result.ok
    ? { ok: true, message: lastLine(result.stdout) || mainT('team.git.upToDate') }
    : failure(result.stderr, lastLine(result.stderr) || mainT('team.git.pullFailed'))
}

export async function gitPush(root: string): Promise<GitActionResult> {
  const result = await run(['push'], root, 30000)
  return result.ok
    ? { ok: true, message: lastLine(result.stderr) || lastLine(result.stdout) || mainT('team.git.pushed') }
    : failure(result.stderr, lastLine(result.stderr) || mainT('team.git.pushFailed'))
}

export async function gitInit(root: string): Promise<GitActionResult> {
  // Start on `main` whatever the machine's init.defaultBranch says, so a new team
  // collection matches GitHub/GitLab defaults. Git older than 2.28 lacks the flag.
  let result = await run(['init', '--initial-branch=main'], root)
  if (!result.ok) result = await run(['init'], root)
  return result.ok
    ? { ok: true, message: mainT('team.git.trackingOn') }
    : { ok: false, message: result.stderr.trim() || mainT('team.git.initFailed') }
}

/**
 * One-button sync for non-developers: save local changes, get the team's, then
 * share. Commit (if needed), refresh remote refs, MERGE pull (not --ff-only,
 * which fails the moment both sides changed) and push. A merge that hits
 * conflicts is aborted so the folder is never left in a silent half-merged
 * state — the UI then asks "keep mine / keep theirs" via gitSyncResolve.
 *
 * The first sync after connecting a repository has no upstream yet: publish
 * the branch, or link to the team's branch of the same name when it exists.
 */
export async function gitSync(
  root: string,
  message: string,
  onProgress?: (phase: SyncPhase) => void
): Promise<GitActionResult> {
  const status = await gitStatus(root)
  if (!status.isRepo) return { ok: false, message: mainT('team.git.notSetUp') }
  if (status.dirtyCount > 0) {
    onProgress?.('saving')
    const commit = await gitCommitAll(root, message || 'Update collection')
    if (!commit.ok) return { ...commit, message: wrap('team.git.prefix.save', commit.message) }
  }
  const remote = await firstRemote(root)
  if (!remote) {
    return { ok: true, message: mainT('team.git.savedLocalOnly') }
  }

  // Explicit sync is the right place to touch the network.
  onProgress?.('receiving')
  const fetched = await gitFetch(root)
  if (!fetched.ok) return { ...fetched, message: wrap('team.git.prefix.get', fetched.message) }

  let firstLink = false
  if (!status.hasUpstream) {
    const branch = (await run(['rev-parse', '--abbrev-ref', 'HEAD'], root)).stdout.trim()
    const teamHasBranch = await run(['rev-parse', '--verify', '--quiet', `refs/remotes/${remote}/${branch}`], root)
    if (!teamHasBranch.ok) {
      onProgress?.('sending')
      const publish = await run(['push', '-u', remote, 'HEAD'], root, 30000)
      if (!publish.ok) {
        return failure(publish.stderr, lastLine(publish.stderr) || mainT('team.git.publishFailed'), 'team.git.prefix.share')
      }
      const count = Number((await run(['rev-list', '--count', 'HEAD'], root)).stdout.trim()) || 0
      return { ok: true, message: mainT('team.git.sharedNow'), received: 0, sent: count }
    }
    await run(['branch', `--set-upstream-to=${remote}/${branch}`], root)
    firstLink = true
  }

  const before = (await aheadBehind(root)) ?? { ahead: 0, behind: 0 }
  // Merge pull tolerates both sides having changed; --no-rebase keeps the
  // simple merge model rather than rebasing local commits.
  const pullArgs = ['pull', '--no-rebase']
  if (firstLink) pullArgs.push('--allow-unrelated-histories')
  const pull = await run(pullArgs, root, 30000)
  if (!pull.ok) {
    // Leave nothing half-merged: abort the in-progress merge if there is one.
    await run(['merge', '--abort'], root)
    const detail = lastLine(pull.stderr) || lastLine(pull.stdout)
    const code = classifyGitError(pull.stderr)
    const conflicting = !code && /conflict|merge|diverg/i.test(`${pull.stdout} ${pull.stderr}`)
    return conflicting
      ? { ok: false, conflict: true, message: mainT('team.git.conflictSame') }
      : failure(pull.stderr, detail || mainT('team.git.pullFailedLower'), 'team.git.prefix.get')
  }
  if (before.ahead > 0) onProgress?.('sending')
  const push = await gitPush(root)
  if (!push.ok) return { ...push, message: wrap('team.git.prefix.share', push.message) }
  return {
    ok: true,
    message: mainT('team.git.inSync'),
    received: before.behind,
    sent: before.ahead
  }
}

/** One request both sides changed, with each side's full text (null = deleted). */
export interface GitConflict {
  path: string
  name: string
  mine: string | null
  theirs: string | null
}

/**
 * What a sync that stopped on a conflict would clash on, computed without
 * touching the working tree (the merge was already aborted). Uses
 * `git merge-tree --write-tree` (git 2.38+) and falls back to "files changed
 * on both sides" on older git.
 */
export async function gitConflicts(root: string): Promise<GitConflict[]> {
  const upstream = await run(['rev-parse', '--verify', '--quiet', '@{upstream}'], root)
  if (!upstream.ok) return []
  const tree = await run(['merge-tree', '--write-tree', '--name-only', '--no-messages', 'HEAD', '@{upstream}'], root)
  let paths: string[]
  const lines = tree.stdout.split('\n').filter(Boolean)
  if (tree.ok) return []
  if (lines.length > 0 && /^[0-9a-f]{40,64}$/.test(lines[0])) {
    paths = [...new Set(lines.slice(1))]
  } else {
    const base = (await run(['merge-base', 'HEAD', '@{upstream}'], root)).stdout.trim()
    if (!base) return []
    const mineChanged = (await run(['diff', '--name-only', base, 'HEAD'], root)).stdout.split('\n')
    const theirsChanged = new Set((await run(['diff', '--name-only', base, '@{upstream}'], root)).stdout.split('\n'))
    paths = mineChanged.filter((p) => p && theirsChanged.has(p))
  }
  return Promise.all(
    paths.map(async (path) => {
      const mine = await run(['show', `HEAD:${path}`], root)
      const theirs = await run(['show', `@{upstream}:${path}`], root)
      const mineText = mine.ok ? mine.stdout : null
      const theirsText = theirs.ok ? theirs.stdout : null
      return { path, name: requestNameFromText(mineText ?? theirsText, path), mine: mineText, theirs: theirsText }
    })
  )
}

/**
 * Finish a sync that stopped on overlapping changes, without ever showing the
 * user a merge tool. `prefer` picks the winning side for the overlapping parts
 * only — everything that doesn't overlap is still combined from both sides
 * (`git pull -X ours|theirs`). Falls back to a clean abort if git still can't
 * finish (e.g. a file deleted on one side and edited on the other).
 *
 * `choices` overrides `prefer` per file (keys are repo-relative paths), with
 * the same "overlapping parts only" rule applied file by file.
 */
export async function gitSyncResolve(
  root: string,
  prefer: 'mine' | 'theirs',
  message: string,
  choices?: Record<string, 'mine' | 'theirs'>
): Promise<GitActionResult> {
  const status = await gitStatus(root)
  if (!status.isRepo) return { ok: false, message: mainT('team.git.notSetUp') }
  if (status.dirtyCount > 0) {
    const commit = await gitCommitAll(root, message || 'Update collection')
    if (!commit.ok) return { ...commit, message: wrap('team.git.prefix.save', commit.message) }
  }
  await gitFetch(root)
  const perFile = choices && Object.keys(choices).length > 0
  // From the merge's point of view "ours" is the local side.
  const side = prefer === 'mine' ? 'ours' : 'theirs'
  const pull = perFile
    ? { ok: false, stdout: '', stderr: '' }
    : await run(['pull', '--no-rebase', '-X', side], root, 30000)
  if (!pull.ok) {
    if (!perFile) await run(['merge', '--abort'], root)
    // -X can't settle edit-vs-delete conflicts. Redo the merge, then resolve
    // each still-unmerged path by taking the chosen side (or deleting the file
    // when the chosen side deleted it), and complete the merge commit.
    const redo = await run(['pull', '--no-rebase', '--no-commit'], root, 30000)
    const unmerged = await run(['diff', '--name-only', '--diff-filter=U'], root)
    for (const path of unmerged.stdout.split('\n').filter(Boolean)) {
      const pathSide = (choices?.[path] ?? prefer) === 'mine' ? 'ours' : 'theirs'
      if (perFile && (await mergeFileFavoring(root, path, pathSide))) continue
      const take = await run(['checkout', `--${pathSide}`, '--', path], root)
      if (!take.ok) await run(['rm', '--force', '--quiet', '--', path], root)
    }
    const add = await run(['add', '-A'], root)
    const merging = await run(['rev-parse', '--verify', '--quiet', 'MERGE_HEAD'], root)
    const commit = merging.ok ? await run(['commit', '--no-edit'], root) : { ok: redo.ok, stdout: '', stderr: redo.stderr }
    if (!add.ok || !commit.ok) {
      await run(['merge', '--abort'], root)
      const detail = lastLine(pull.stderr || redo.stderr) || mainT('team.git.mergeFailed')
      return failure(pull.stderr || redo.stderr, detail, 'team.git.prefix.combine')
    }
  }
  const push = await gitPush(root)
  if (!push.ok) return { ...push, message: wrap('team.git.prefix.share', push.message) }
  return {
    ok: true,
    message: perFile
      ? mainT('team.git.doneChoices')
      : prefer === 'mine'
        ? mainT('team.git.doneMine')
        : mainT('team.git.doneTheirs')
  }
}

/**
 * Resolve one unmerged text file hunk by hunk: non-overlapping edits from both
 * sides are kept, overlapping ones take `side`. False when a side is missing
 * (edit vs delete), so the caller takes the whole file instead.
 */
async function mergeFileFavoring(root: string, path: string, side: 'ours' | 'theirs'): Promise<boolean> {
  const [base, ours, theirs] = await Promise.all(
    [1, 2, 3].map((stage) => run(['show', `:${stage}:${path}`], root))
  )
  if (!ours.ok || !theirs.ok) return false
  const dir = await mkdtemp(join(tmpdir(), 'tiger-merge-'))
  try {
    const files = { ours: join(dir, 'ours'), base: join(dir, 'base'), theirs: join(dir, 'theirs') }
    await writeFile(files.ours, ours.stdout)
    await writeFile(files.base, base.ok ? base.stdout : '')
    await writeFile(files.theirs, theirs.stdout)
    const merged = await run(['merge-file', '-p', `--${side}`, files.ours, files.base, files.theirs], root)
    await writeFile(join(root, path), merged.stdout)
    return (await run(['add', '--', path], root)).ok
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * Connect the collection to a shared repository and check we can reach it.
 * Publishing happens on the first sync, so the setup reads as three steps:
 * track, connect, sync. A remote we just added is removed again when it can't
 * be reached, so a typo never leaves a half-connected collection behind.
 */
export async function gitSetRemote(root: string, url: string): Promise<GitActionResult> {
  if (!/^(https?:\/\/|git@|ssh:\/\/|file:\/\/)/.test(url.trim())) {
    return { ok: false, message: mainT('team.git.notRepoUrl') }
  }
  const existing = await run(['remote'], root)
  const hadOrigin = existing.stdout.split('\n').includes('origin')
  const command = hadOrigin
    ? ['remote', 'set-url', 'origin', url.trim()]
    : ['remote', 'add', 'origin', url.trim()]
  const setRemote = await run(command, root)
  if (!setRemote.ok) return { ok: false, message: setRemote.stderr.trim() || mainT('team.git.addRemoteFailed') }

  const reach = await run(['ls-remote', '--heads', 'origin'], root, 30000)
  if (!reach.ok) {
    if (!hadOrigin) await run(['remote', 'remove', 'origin'], root)
    return failure(reach.stderr, lastLine(reach.stderr) || mainT('team.git.cannotReach'))
  }
  const remoteHasContent = reach.stdout.trim().length > 0
  return { ok: true, message: mainT('team.git.connected'), remoteHasContent }
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
  if (result.ok) {
    return { ok: true, message: create ? mainT('team.git.createdBranch', { branch }) : mainT('team.git.switchedBranch', { branch }) }
  }
  if (/would be overwritten/i.test(result.stderr)) {
    return { ok: false, message: mainT('team.git.saveOrDiscard') }
  }
  return { ok: false, message: lastLine(result.stderr) || mainT('team.git.checkoutFailed') }
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

/**
 * Throw away unsaved changes (all, or just `paths`), new files included, in a
 * way that can be undone: the changes go to a git stash and the result carries
 * its id as `undoToken`. The stash is written with a fixed identity so it
 * works before the user has told git their name.
 */
export async function gitDiscard(root: string, paths?: string[]): Promise<GitActionResult> {
  const head = await run(['rev-parse', '--verify', '--quiet', 'HEAD'], root)
  if (!head.ok) {
    return {
      ok: false,
      code: 'no-commits',
      message: mainT('team.git.noVersionBack')
    }
  }
  const args = [
    '-c',
    'user.name=Tiger',
    '-c',
    'user.email=tiger@localhost',
    'stash',
    'push',
    '--include-untracked',
    '-m',
    'Tiger: discarded changes'
  ]
  if (paths?.length) args.push('--', ...paths)
  const stash = await run(args, root)
  if (!stash.ok) return { ok: false, message: lastLine(stash.stderr) || mainT('team.git.discardFailed') }
  if (/no local changes to save/i.test(stash.stdout + stash.stderr)) {
    return { ok: true, message: mainT('team.git.nothingToDiscard') }
  }
  const token = (await run(['rev-parse', '--verify', '--quiet', 'refs/stash'], root)).stdout.trim()
  return { ok: true, message: mainT('team.git.discarded'), undoToken: token || undefined }
}

/** Bring back changes thrown away by gitDiscard. */
export async function gitUndoDiscard(root: string, token: string): Promise<GitActionResult> {
  if (!/^[0-9a-f]{7,64}$/.test(token)) return { ok: false, message: mainT('team.git.nothingToUndo') }
  const apply = await run(['stash', 'apply', token], root)
  if (!apply.ok) {
    return { ok: false, message: wrap('team.git.prefix.restore', lastLine(apply.stderr) || mainT('team.git.applyFailed')) }
  }
  const list = await run(['stash', 'list', '--format=%H'], root)
  const index = list.stdout.split('\n').indexOf(token)
  if (index >= 0) await run(['stash', 'drop', `stash@{${index}}`], root)
  return { ok: true, message: mainT('team.git.restored') }
}

/** Discard every unsaved change, new files included (undoable, see gitDiscard). */
export function gitDiscardAll(root: string): Promise<GitActionResult> {
  return gitDiscard(root)
}

/** Clone a remote repository into `targetDir` (which must not yet exist). */
export async function gitClone(url: string, targetDir: string): Promise<GitActionResult> {
  if (!/^(https?:\/\/|git@|ssh:\/\/|file:\/\/)/.test(url.trim())) {
    return { ok: false, message: mainT('team.git.notRepoUrl') }
  }
  const result = await run(['clone', url.trim(), targetDir], undefined, 60000)
  return result.ok
    ? { ok: true, message: mainT('team.git.cloned', { dir: targetDir }) }
    : failure(result.stderr, lastLine(result.stderr) || mainT('team.git.cloneFailed'))
}

export function repoNameFromUrl(url: string): string {
  const last = url.trim().replace(/\/+$/, '').split(/[/:]/).pop() ?? 'collection'
  return last.replace(/\.git$/, '') || 'collection'
}
