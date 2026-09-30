/**
 * Team sync (git) wording and logic for people who have never used git.
 * Pure functions (plus one tiny store) so every rule here is unit-tested:
 * the status summary, grouping changes by request, the suggested version
 * note, repository URL checks, and what to do when sign-in fails.
 *
 * Vocabulary, used everywhere in the UI (git term in small print only):
 *   save a version = commit        share / upload = push
 *   get team's changes = pull      sync = get + share in one click
 *   version line = branch          shared repository = remote
 */

import { useSyncExternalStore } from 'react'
import type { GitErrorCode, GitStatus, SyncPhase } from '../../main/git'
import type { MessageKey } from '@core/i18n'
import { t } from './i18n'

// ---------------------------------------------------------------------------
// Status at a glance
// ---------------------------------------------------------------------------

export type SyncKind =
  | 'unknown'
  | 'untracked'
  | 'conflict'
  | 'updates'
  | 'local-changes'
  | 'to-share'
  | 'local-only'
  | 'unpublished'
  | 'up-to-date'

export type SyncTone = 'neutral' | 'ok' | 'attention' | 'danger'

export interface SyncSummary {
  kind: SyncKind
  /** Short text for badges: always shown next to an icon, never color alone. */
  label: string
  /**
   * For a narrow sidebar row: a count, "Conflict", or empty when the state's
   * own icon is distinct enough. The full label is the accessible name and
   * the tooltip there.
   */
  short: string
  /** One sentence saying what it means and what to do. */
  detail: string
  tone: SyncTone
}

/** The subset of GitStatus the sidebar poll also has. */
export type SyncInput = Pick<GitStatus, 'isRepo' | 'dirtyCount' | 'ahead' | 'behind'> &
  Partial<Pick<GitStatus, 'hasRemote' | 'hasUpstream'>>

/**
 * One state per collection, in priority order: a pending conflict beats
 * everything, then team updates (get them before sharing), then local work.
 */
export function summarizeSync(
  status: SyncInput | null | undefined,
  opts: { conflict?: boolean } = {}
): SyncSummary {
  if (!status)
    return {
      kind: 'unknown',
      label: t('team.ux.checking.label'),
      short: t('team.ux.checking.short'),
      detail: t('team.ux.checking.detail'),
      tone: 'neutral'
    }
  if (!status.isRepo) {
    return {
      kind: 'untracked',
      label: t('team.ux.untracked.label'),
      short: t('team.ux.untracked.label'),
      detail: t('team.ux.untracked.detail'),
      tone: 'neutral'
    }
  }
  if (opts.conflict) {
    return {
      kind: 'conflict',
      label: t('team.ux.conflict.label'),
      short: t('team.ux.conflict.short'),
      detail: t('team.ux.conflict.detail'),
      tone: 'danger'
    }
  }
  const shared = status.hasRemote !== false
  const yours = status.dirtyCount + status.ahead
  if (status.behind > 0) {
    return {
      kind: 'updates',
      label: t('team.ux.updates.label', { count: status.behind }),
      short: `${status.behind}`,
      detail:
        yours > 0 ? t('team.ux.updates.detailBoth') : t('team.ux.updates.detailTeam'),
      tone: 'attention'
    }
  }
  if (status.dirtyCount > 0) {
    return {
      kind: 'local-changes',
      label: t('team.ux.localChanges.label', { count: status.dirtyCount }),
      short: `${status.dirtyCount}`,
      detail: shared
        ? t('team.ux.localChanges.detailShared')
        : t('team.ux.localChanges.detailLocal'),
      tone: 'attention'
    }
  }
  if (status.ahead > 0) {
    return {
      kind: 'to-share',
      label: t('team.ux.toShare.label', { count: status.ahead }),
      short: `${status.ahead}`,
      detail: t('team.ux.toShare.detail'),
      tone: 'attention'
    }
  }
  if (!shared) {
    return {
      kind: 'local-only',
      label: t('team.ux.localOnly.label'),
      short: '',
      detail: t('team.ux.localOnly.detail'),
      tone: 'neutral'
    }
  }
  if (status.hasUpstream === false) {
    return {
      kind: 'unpublished',
      label: t('team.ux.unpublished.label'),
      short: '',
      detail: t('team.ux.unpublished.detail'),
      tone: 'attention'
    }
  }
  return {
    kind: 'up-to-date',
    label: t('team.ux.upToDate.label'),
    short: '',
    detail: t('team.ux.upToDate.detail'),
    tone: 'ok'
  }
}

/** What the setup stepper should show: 1 track, 2 connect, 3 first sync, or done. */
export function setupStep(status: SyncInput | null | undefined): 1 | 2 | 3 | null {
  if (!status || !status.isRepo) return 1
  if (status.hasRemote === false) return 2
  if (status.hasUpstream === false) return 3
  return null
}

// ---------------------------------------------------------------------------
// Changes, grouped by request
// ---------------------------------------------------------------------------

export interface ChangeItem {
  path: string
  /** What a person calls it: the request name, or "Demo environment". */
  name: string
  /** Folder trail for context, e.g. "users". Empty at the collection root. */
  folder: string
}

export interface GroupedChanges {
  added: ChangeItem[]
  changed: ChangeItem[]
  removed: ChangeItem[]
}

export function changeGroup(status: string): keyof GroupedChanges {
  if (status === '??' || status.startsWith('A')) return 'added'
  if (status.startsWith('D') || status.endsWith('D')) return 'removed'
  return 'changed'
}

/** Human name for a changed file; `names` maps paths to request names from disk. */
export function changeName(path: string, names: Record<string, string> = {}): string {
  const parts = path.split('/')
  const file = parts[parts.length - 1]
  if (file === 'collection.tiger') return t('team.ux.name.collection')
  if (file === 'folder.tiger') return t('team.ux.name.folder', {
      folder: parts[parts.length - 2] ?? t('team.ux.name.folderFallback')
    })
  const base = names[path] ?? file.replace(/\.tiger$/, '')
  if (parts[0] === 'environments' && file.endsWith('.tiger')) return t('team.ux.name.environment', { name: base })
  return base
}

export function groupChanges(
  files: Array<{ status: string; path: string }>,
  names: Record<string, string> = {}
): GroupedChanges {
  const groups: GroupedChanges = { added: [], changed: [], removed: [] }
  for (const f of files) {
    const parts = f.path.split('/')
    const folder = parts[0] === 'environments' ? '' : parts.slice(0, -1).join(' / ')
    groups[changeGroup(f.status)].push({ path: f.path, name: changeName(f.path, names), folder })
  }
  for (const list of [groups.added, groups.changed, groups.removed]) {
    list.sort((a: ChangeItem, b: ChangeItem) => a.name.localeCompare(b.name))
  }
  return groups
}

/**
 * A version note written from the changes: "Update Get user, add Create post".
 * Falls back to counts when names would not fit a one-line summary.
 */
export function suggestCommitMessage(groups: GroupedChanges, maxLength = 72): string {
  const order: Array<[keyof GroupedChanges, MessageKey]> = [
    ['changed', 'team.ux.note.update'],
    ['added', 'team.ux.note.add'],
    ['removed', 'team.ux.note.remove']
  ]
  const named = (items: ChangeItem[]): string =>
    items.length === 1
      ? items[0].name
      : items.length === 2
        ? t('team.ux.note.pair', { a: items[0].name, b: items[1].name })
        : t('team.ux.note.more', {
            a: items[0].name,
            b: items[1].name,
            count: items.length - 2
          })
  const counted = (items: ChangeItem[]): string =>
    t('team.ux.note.requests', { count: items.length })
  const build = (describe: (items: ChangeItem[]) => string): string =>
    order
      .filter(([key]) => groups[key].length > 0)
      .map(([key, phrase]) => t(phrase, { items: describe(groups[key]) }))
      .join(t('team.ux.note.separator'))
  let text = build(named)
  if (text.length > maxLength) text = build(counted)
  return text ? text[0].toUpperCase() + text.slice(1) : ''
}

// ---------------------------------------------------------------------------
// Repository URLs
// ---------------------------------------------------------------------------

export interface UrlCheck {
  ok: boolean
  /** Why it is not usable, in plain words. Empty while the field is empty. */
  message?: string
  /** A corrected URL the user can apply in one click. */
  fix?: string
}

const HOSTS = /^(?:www\.)?(github\.com|gitlab\.com|bitbucket\.org)$/i

export function validateRepoUrl(raw: string): UrlCheck {
  const url = raw.trim()
  if (!url) return { ok: false }
  if (/\s/.test(url)) return { ok: false, message: t('team.ux.url.noSpaces') }
  if (/^git@[^:\s]+:.+/.test(url) || /^ssh:\/\/\S+/.test(url) || /^file:\/\/\S+/.test(url))
    return { ok: true }

  const withScheme = /^https?:\/\//i.test(url) ? url : null
  if (!withScheme) {
    const hostFirst = url.split('/')[0]
    if (HOSTS.test(hostFirst) || /^[\w-]+(\.[\w-]+)+$/.test(hostFirst)) {
      const fix = normaliseWebUrl(`https://${url}`)
      return { ok: false, message: t('team.ux.url.addHttps'), fix }
    }
    return {
      ok: false,
      message: t('team.ux.url.paste')
    }
  }
  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    return {
      ok: false,
      message: t('team.ux.url.incomplete')
    }
  }
  const segments = parsed.pathname.split('/').filter(Boolean)
  if (HOSTS.test(parsed.hostname)) {
    if (segments.length < 2) {
      return {
        ok: false,
        message: t('team.ux.url.accountPage')
      }
    }
    const fix = normaliseWebUrl(withScheme)
    // GitLab allows sub-groups (group/sub/repo); its pages sit after "/-/".
    const isPage = /gitlab/i.test(parsed.hostname) ? segments.includes('-') : segments.length > 2
    if (isPage) {
      return {
        ok: false,
        message: t('team.ux.url.repoPage'),
        fix
      }
    }
    return { ok: true }
  }
  if (segments.length === 0) {
    return { ok: false, message: t('team.ux.url.addPath') }
  }
  return { ok: true }
}

/** github.com/team/repo/tree/main → https://github.com/team/repo.git */
function normaliseWebUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url)
    const segments = parsed.pathname.split('/').filter(Boolean)
    const dash = segments.indexOf('-')
    const repoPath =
      /gitlab/i.test(parsed.hostname) && dash > 0 ? segments.slice(0, dash) : segments.slice(0, 2)
    if (repoPath.length < 2) return undefined
    const last = repoPath.length - 1
    repoPath[last] = repoPath[last].replace(/\.git$/, '')
    return `https://${parsed.hostname.replace(/^www\./, '')}/${repoPath.join('/')}.git`
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Sign-in and setup errors: what to do, per platform
// ---------------------------------------------------------------------------

export type HelpPlatform = 'mac' | 'windows' | 'linux'

export interface HelpLink {
  label: string
  url: string
}

export interface ErrorHelp {
  title: string
  steps: string[]
  links: HelpLink[]
}

const LINKS = {
  gcm: {
    labelKey: 'team.ux.link.gcm',
    url: 'https://github.com/git-ecosystem/git-credential-manager/blob/main/docs/install.md'
  },
  githubToken: {
    labelKey: 'team.ux.link.githubToken',
    url: 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens'
  },
  gitlabToken: {
    labelKey: 'team.ux.link.gitlabToken',
    url: 'https://docs.gitlab.com/user/profile/personal_access_tokens/'
  },
  githubSsh: {
    labelKey: 'team.ux.link.githubSsh',
    url: 'https://docs.github.com/en/authentication/connecting-to-github-with-ssh'
  },
  gitForWindows: { labelKey: 'team.ux.link.gitForWindows', url: 'https://gitforwindows.org/' }
} satisfies Record<string, { labelKey: MessageKey; url: string }>

type LinkName = keyof typeof LINKS

const links = (...names: LinkName[]): HelpLink[] =>
  names.map((n) => ({ label: t(LINKS[n].labelKey), url: LINKS[n].url }))

export function errorHelp(
  code: GitErrorCode | undefined,
  platform: HelpPlatform
): ErrorHelp | null {
  switch (code) {
    case 'auth-required':
      return {
        title: t('team.ux.help.authRequired.title'),
        steps:
          platform === 'windows'
            ? [
                t('team.ux.help.authRequired.winStep1'),
                t('team.ux.help.authRequired.winStep2'),
                t('team.ux.help.authRequired.sshStep')
              ]
            : [
                t('team.ux.help.authRequired.step1'),
                t('team.ux.help.authRequired.step2'),
                t('team.ux.help.authRequired.sshStep')
              ],
        links:
          platform === 'windows'
            ? links('gitForWindows', 'githubToken', 'githubSsh')
            : links('gcm', 'githubToken', 'gitlabToken', 'githubSsh')
      }
    case 'auth-failed':
      return {
        title: t('team.ux.help.authFailed.title'),
        steps: [
          t('team.ux.help.authFailed.step1'),
          platform === 'windows'
            ? t('team.ux.help.authFailed.win')
            : platform === 'mac'
              ? t('team.ux.help.authFailed.mac')
              : t('team.ux.help.authFailed.other')
        ],
        links: links('githubToken', 'gitlabToken')
      }
    case 'ssh-key':
      return {
        title: t('team.ux.help.sshKey.title'),
        steps: [
          t('team.ux.help.sshKey.step1'),
          platform === 'windows' ? t('team.ux.help.sshKey.win') : t('team.ux.help.sshKey.other'),
          t('team.ux.help.sshKey.step3')
        ],
        links: links('githubSsh')
      }
    case 'not-found':
      return {
        title: t('team.ux.help.notFound.title'),
        steps: [
          t('team.ux.help.notFound.step1'),
          t('team.ux.help.notFound.step2'),
          t('team.ux.help.notFound.step3')
        ],
        links: []
      }
    case 'network':
      return {
        title: t('team.ux.help.network.title'),
        steps: [t('team.ux.help.network.step1'), t('team.ux.help.network.step2')],
        links: []
      }
    case 'rejected':
      return {
        title: t('team.ux.help.rejected.title'),
        steps: [t('team.ux.help.rejected.step1')],
        links: []
      }
    case 'no-commits':
      return {
        title: t('team.ux.help.noCommits.title'),
        steps: [t('team.ux.help.noCommits.step1')],
        links: []
      }
    default:
      return null
  }
}

export function currentPlatform(): HelpPlatform {
  const p = typeof navigator === 'undefined' ? '' : navigator.platform
  return /Win/i.test(p) ? 'windows' : /Mac/i.test(p) ? 'mac' : 'linux'
}

// ---------------------------------------------------------------------------
// Progress and results
// ---------------------------------------------------------------------------

export function progressText(phase: SyncPhase | null | undefined): string {
  switch (phase) {
    case 'saving':
      return t('team.ux.progress.saving')
    case 'receiving':
      return t('team.ux.progress.receiving')
    case 'sending':
      return t('team.ux.progress.sending')
    default:
      return t('team.ux.progress.default')
  }
}

/** "Synced: 2 updates received, 3 sent." from a sync result. */
export function syncResultText(result: {
  ok: boolean
  message: string
  received?: number
  sent?: number
}): string {
  if (!result.ok || (result.received === undefined && result.sent === undefined))
    return result.message
  const received = result.received ?? 0
  const sent = result.sent ?? 0
  if (received === 0 && sent === 0) return t('team.ux.synced.upToDate')
  if (sent === 0) return t('team.ux.synced.received', { count: received })
  if (received === 0) return t('team.ux.synced.sent', { count: sent })
  return t('team.ux.synced.both', {
    received: t('team.ux.synced.updates', { count: received }),
    sent
  })
}

// ---------------------------------------------------------------------------
// Conflicts: side-by-side lines, and a tiny store shared across views
// ---------------------------------------------------------------------------

export interface SideLine {
  text: string
  /** Not present on the other side. */
  differs: boolean
}

/** Lines of `a`, flagged when the other version lacks them (a readable, not minimal, diff). */
export function markDifferences(a: string | null, b: string | null): SideLine[] {
  if (a === null) return []
  const other = new Set((b ?? '').split('\n'))
  return a
    .replace(/\n$/, '')
    .split('\n')
    .map((text) => ({ text, differs: !other.has(text) }))
}

// Roots whose last sync stopped on a conflict. The collection page, the team
// sync dialog and the sidebar row all read it, so "Decide later" is never lost.
let conflictRoots: ReadonlySet<string> = new Set()
const listeners = new Set<() => void>()

export function setConflict(root: string, on: boolean): void {
  if (conflictRoots.has(root) === on) return
  const next = new Set(conflictRoots)
  if (on) next.add(root)
  else next.delete(root)
  conflictRoots = next
  listeners.forEach((l) => l())
}

export function hasConflict(root: string | undefined): boolean {
  return !!root && conflictRoots.has(root)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Any view that changed a repository bumps this, so every other view showing
// the same collection (page, dialog, sidebar) refreshes instead of going stale.
let gitEpoch = 0
const epochListeners = new Set<() => void>()

export function notifyGitChanged(): void {
  gitEpoch += 1
  epochListeners.forEach((l) => l())
}

/** Subscribe to repository changes made anywhere in the app; returns unsubscribe. */
export function onGitChanged(listener: () => void): () => void {
  epochListeners.add(listener)
  return () => {
    epochListeners.delete(listener)
  }
}

export function useGitEpoch(): number {
  return useSyncExternalStore(
    onGitChanged,
    () => gitEpoch,
    () => gitEpoch
  )
}

/** Re-renders when any collection's conflict flag changes. */
export function useConflictRoots(): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribe,
    () => conflictRoots,
    () => conflictRoots
  )
}
