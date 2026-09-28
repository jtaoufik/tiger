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

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

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
      label: 'Checking…',
      short: 'Checking',
      detail: 'Checking version tracking.',
      tone: 'neutral'
    }
  if (!status.isRepo) {
    return {
      kind: 'untracked',
      label: 'Not tracked',
      short: 'Not tracked',
      detail:
        'Turn on version tracking to keep a history of changes and share this collection with your team.',
      tone: 'neutral'
    }
  }
  if (opts.conflict) {
    return {
      kind: 'conflict',
      label: 'Conflict: needs a decision',
      short: 'Conflict',
      detail: 'You and a teammate changed the same request. Choose which version to keep.',
      tone: 'danger'
    }
  }
  const shared = status.hasRemote !== false
  const yours = status.dirtyCount + status.ahead
  if (status.behind > 0) {
    return {
      kind: 'updates',
      label: `${plural(status.behind, 'update')} from team`,
      short: `${status.behind}`,
      detail:
        yours > 0
          ? 'Your team made changes and so did you. Sync combines both.'
          : 'Your team made changes you do not have yet. Sync to get them.',
      tone: 'attention'
    }
  }
  if (status.dirtyCount > 0) {
    return {
      kind: 'local-changes',
      label: plural(status.dirtyCount, 'local change'),
      short: `${status.dirtyCount}`,
      detail: shared
        ? 'Saved on this computer, not yet shared. Sync to share them with your team.'
        : 'Saved on this computer. Save a version to keep them in the history.',
      tone: 'attention'
    }
  }
  if (status.ahead > 0) {
    return {
      kind: 'to-share',
      label: `${plural(status.ahead, 'version')} to share`,
      short: `${status.ahead}`,
      detail: 'Saved as versions, not yet shared. Sync to share them with your team.',
      tone: 'attention'
    }
  }
  if (!shared) {
    return {
      kind: 'local-only',
      label: 'Only on this computer',
      short: '',
      detail:
        'Versions are kept on this computer. Connect a shared repository to work with your team.',
      tone: 'neutral'
    }
  }
  if (status.hasUpstream === false) {
    return {
      kind: 'unpublished',
      label: 'Not shared yet',
      short: '',
      detail: 'Connected to a shared repository. Sync once to publish this collection to it.',
      tone: 'attention'
    }
  }
  return {
    kind: 'up-to-date',
    label: 'Up to date',
    short: '',
    detail: 'Everything is in sync with your team.',
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
  if (file === 'collection.tiger') return 'Collection settings'
  if (file === 'folder.tiger') return `${parts[parts.length - 2] ?? 'Folder'} folder settings`
  const base = names[path] ?? file.replace(/\.tiger$/, '')
  if (parts[0] === 'environments' && file.endsWith('.tiger')) return `${base} environment`
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
  const order: Array<[keyof GroupedChanges, string]> = [
    ['changed', 'update'],
    ['added', 'add'],
    ['removed', 'remove']
  ]
  const named = (items: ChangeItem[]): string =>
    items.length <= 2
      ? items.map((i) => i.name).join(' and ')
      : `${items[0].name}, ${items[1].name} and ${items.length - 2} more`
  const counted = (items: ChangeItem[]): string => plural(items.length, 'request')
  const build = (describe: (items: ChangeItem[]) => string): string =>
    order
      .filter(([key]) => groups[key].length > 0)
      .map(([key, verb]) => `${verb} ${describe(groups[key])}`)
      .join(', ')
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
  if (/\s/.test(url)) return { ok: false, message: 'A repository address has no spaces.' }
  if (/^git@[^:\s]+:.+/.test(url) || /^ssh:\/\/\S+/.test(url) || /^file:\/\/\S+/.test(url))
    return { ok: true }

  const withScheme = /^https?:\/\//i.test(url) ? url : null
  if (!withScheme) {
    const hostFirst = url.split('/')[0]
    if (HOSTS.test(hostFirst) || /^[\w-]+(\.[\w-]+)+$/.test(hostFirst)) {
      const fix = normaliseWebUrl(`https://${url}`)
      return { ok: false, message: 'Add https:// at the start.', fix }
    }
    return {
      ok: false,
      message:
        'Paste the address from the Code button on GitHub or the Clone button on GitLab. It starts with https:// or git@.'
    }
  }
  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    return {
      ok: false,
      message: 'That address is not complete. Copy it again from your repository page.'
    }
  }
  const segments = parsed.pathname.split('/').filter(Boolean)
  if (HOSTS.test(parsed.hostname)) {
    if (segments.length < 2) {
      return {
        ok: false,
        message: 'That is an account page. Open the repository and copy its address.'
      }
    }
    const fix = normaliseWebUrl(withScheme)
    // GitLab allows sub-groups (group/sub/repo); its pages sit after "/-/".
    const isPage = /gitlab/i.test(parsed.hostname) ? segments.includes('-') : segments.length > 2
    if (isPage) {
      return {
        ok: false,
        message: 'That is a page inside the repository. Use the repository address instead.',
        fix
      }
    }
    return { ok: true }
  }
  if (segments.length === 0) {
    return { ok: false, message: 'Add the repository path after the server name.' }
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

export const HELP_LINKS = {
  gcm: {
    label: 'Install Git Credential Manager',
    url: 'https://github.com/git-ecosystem/git-credential-manager/blob/main/docs/install.md'
  },
  githubToken: {
    label: 'GitHub: create a personal access token',
    url: 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens'
  },
  gitlabToken: {
    label: 'GitLab: create a personal access token',
    url: 'https://docs.gitlab.com/user/profile/personal_access_tokens/'
  },
  githubSsh: {
    label: 'GitHub: connect with an SSH key',
    url: 'https://docs.github.com/en/authentication/connecting-to-github-with-ssh'
  },
  gitForWindows: { label: 'Download Git for Windows', url: 'https://gitforwindows.org/' }
} satisfies Record<string, HelpLink>

export function errorHelp(
  code: GitErrorCode | undefined,
  platform: HelpPlatform
): ErrorHelp | null {
  switch (code) {
    case 'auth-required':
      return {
        title: 'Sign-in needed to reach this repository',
        steps:
          platform === 'windows'
            ? [
                'Git for Windows includes Git Credential Manager. Try again: a sign-in window should open.',
                'No window? Reinstall Git for Windows and keep "Git Credential Manager" ticked.',
                'Or use the SSH address (git@…) if you already have an SSH key.'
              ]
            : [
                'Install Git Credential Manager, then try again and sign in in the browser window it opens.',
                'Or sign in once from a terminal: run git clone with this address and paste a personal access token as the password.',
                'Or use the SSH address (git@…) if you already have an SSH key.'
              ],
        links:
          platform === 'windows'
            ? [HELP_LINKS.gitForWindows, HELP_LINKS.githubToken, HELP_LINKS.githubSsh]
            : [HELP_LINKS.gcm, HELP_LINKS.githubToken, HELP_LINKS.gitlabToken, HELP_LINKS.githubSsh]
      }
    case 'auth-failed':
      return {
        title: 'Your sign-in was refused',
        steps: [
          'GitHub and GitLab do not accept account passwords here: use a personal access token as the password.',
          platform === 'windows'
            ? 'A wrong password may be saved: remove it in Windows Credential Manager, then try again.'
            : platform === 'mac'
              ? 'A wrong password may be saved: remove it in Keychain Access (search for the server name), then try again.'
              : 'A wrong password may be saved by your credential helper: remove it, then try again.'
        ],
        links: [HELP_LINKS.githubToken, HELP_LINKS.gitlabToken]
      }
    case 'ssh-key':
      return {
        title: 'Your SSH key was not accepted',
        steps: [
          'Check that your public key is added to your GitHub or GitLab account.',
          platform === 'windows'
            ? 'Start the "OpenSSH Authentication Agent" service, then run ssh-add in a terminal.'
            : 'Load your key in a terminal: ssh-add ~/.ssh/id_ed25519',
          'Or use the https:// address instead.'
        ],
        links: [HELP_LINKS.githubSsh]
      }
    case 'not-found':
      return {
        title: 'Repository not found',
        steps: [
          'Check the address: copy it from the Code button on GitHub or the Clone button on GitLab.',
          'Private repository? Ask its owner to give your account access.',
          'Signed in with another account? The repository may be hidden from that account.'
        ],
        links: []
      }
    case 'network':
      return {
        title: 'Could not reach the server',
        steps: [
          'Check your internet connection, VPN or proxy, then try again.',
          'Check the server name in the address.'
        ],
        links: []
      }
    case 'rejected':
      return {
        title: 'Your team shared changes first',
        steps: ['Sync to get their changes; yours are shared right after.'],
        links: []
      }
    case 'no-commits':
      return {
        title: 'Nothing saved yet',
        steps: ['Save a version first, then try again.'],
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
      return 'Saving your changes as a version…'
    case 'receiving':
      return "Getting team's changes…"
    case 'sending':
      return 'Sharing your changes…'
    default:
      return 'Syncing…'
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
  if (received === 0 && sent === 0) return 'Synced: already up to date with your team.'
  const parts: string[] = []
  if (received > 0) parts.push(`${plural(received, 'update')} received`)
  if (sent > 0) parts.push(received > 0 ? `${sent} sent` : `${plural(sent, 'update')} sent`)
  return `Synced: ${parts.join(', ')}.`
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
