/**
 * Team sync building blocks shared by the collection page and the Team sync
 * dialog: the status badge, the setup stepper, the grouped change list, the
 * conflict chooser, sign-in help and the "join a team collection" dialog.
 * Wording and rules live in ../gitUx.ts.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { splitDiff } from '@core/diffView'
import type { GitActionResult, GitConflict, GitErrorCode, GitStatus } from '../../../main/git'
import type { OpenedCollection } from '../../../preload'
import {
  currentPlatform,
  errorHelp,
  groupChanges,
  markDifferences,
  progressText,
  setConflict,
  setupStep,
  suggestCommitMessage,
  syncResultText,
  notifyGitChanged,
  useConflictRoots,
  useGitEpoch,
  validateRepoUrl,
  type ChangeItem,
  type GroupedChanges,
  type SyncKind,
  type SyncSummary
} from '../gitUx'
import { announce } from '../a11y'
import { actionLabel } from '../actions'
import { Modal } from './Modal'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CloudUploadIcon,
  LaptopIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  TrashIcon,
  UndoIcon,
  UsersIcon,
  WarningIcon,
  type IconProps
} from './Icons'
import './a11y.css'
import './TeamSync.css'

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

const KIND_ICON: Record<SyncKind, (p: IconProps) => ReactNode> = {
  unknown: RefreshIcon,
  untracked: CircleDashedIcon,
  conflict: WarningIcon,
  updates: ArrowDownIcon,
  'local-changes': PencilIcon,
  'to-share': ArrowUpIcon,
  'local-only': LaptopIcon,
  unpublished: CloudUploadIcon,
  'up-to-date': CircleCheckIcon
}

/** Icon + text status. `short` for tight rows; the full label stays in the tooltip. */
export function SyncBadge({ summary, short = false }: { summary: SyncSummary; short?: boolean }) {
  const Icon = KIND_ICON[summary.kind]
  return (
    <span className={`ts-badge tone-${summary.tone}`} title={short ? summary.label : undefined}>
      <Icon size={short ? 11 : 14} />
      <span>{short ? summary.short : summary.label}</span>
    </span>
  )
}

/** The git term, in small print, for people who know it. */
export function GitTerm({ children }: { children: ReactNode }) {
  return <span className="ts-term">git {children}</span>
}

function openLink(url: string): void {
  if (window.tiger?.openExternal) window.tiger.openExternal(url)
  else window.open(url, '_blank', 'noopener')
}

export interface SyncError {
  message: string
  code?: GitErrorCode
}

/**
 * A failure that stays on screen (not a vanishing toast) with the exact next
 * steps for the user's platform, links, and a retry. Identity errors get an
 * inline name + email form instead.
 */
export function ErrorPanel({
  error,
  root,
  onRetry,
  onDismiss
}: {
  error: SyncError
  root?: string
  onRetry?: () => void
  onDismiss?: () => void
}) {
  const help = errorHelp(error.code, currentPlatform())
  const titleId = useId()
  if (error.code === 'identity' && root) {
    return <IdentityForm root={root} onSaved={onRetry} onDismiss={onDismiss} />
  }
  return (
    <div className="ts-error" role="alert" aria-labelledby={titleId}>
      <WarningIcon size={16} className="ts-error-icon" />
      <div className="ts-error-body">
        <b id={titleId}>{help?.title ?? 'That did not work'}</b>
        <p className="ts-error-msg">{error.message}</p>
        {help && help.steps.length > 0 && (
          <ol className="ts-error-steps">
            {help.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        )}
        {help && help.links.length > 0 && (
          <div className="ts-links">
            {help.links.map((l) => (
              <button type="button" key={l.url} className="ts-link" onClick={() => openLink(l.url)}>
                {l.label}
              </button>
            ))}
          </div>
        )}
        {(onRetry || onDismiss) && (
          <div className="ts-row">
            {onRetry && (
              <button type="button" className="btn" onClick={onRetry}>
                <RefreshIcon size={14} /> Try again
              </button>
            )}
            {onDismiss && (
              <button type="button" className="btn ghost" onClick={onDismiss}>
                Dismiss
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function IdentityForm({
  root,
  onSaved,
  onDismiss
}: {
  root: string
  onSaved?: () => void
  onDismiss?: () => void
}) {
  const uid = useId()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [problem, setProblem] = useState('')
  useEffect(
    () =>
      announce('Tiger needs your name and email before it can save a version.', {
        assertive: true
      }),
    []
  )
  const save = async (): Promise<void> => {
    const result = await window.tiger!.git.setIdentity(root, name, email)
    if (!result.ok) return setProblem(result.message)
    announce(result.message)
    onSaved?.()
  }
  return (
    <form
      className="ts-error"
      role="group"
      aria-labelledby={`${uid}-t`}
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <UsersIcon size={16} className="ts-error-icon" />
      <div className="ts-error-body">
        <b id={`${uid}-t`}>Tell Tiger who you are</b>
        <p className="ts-error-msg">
          Each version records a name and email so teammates know who changed what. Saved for this
          collection only.
        </p>
        <div className="ts-identity">
          <label htmlFor={`${uid}-n`}>Your name</label>
          <input
            id={`${uid}-n`}
            value={name}
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
          />
          <label htmlFor={`${uid}-e`}>Work email</label>
          <input
            id={`${uid}-e`}
            type="email"
            value={email}
            autoComplete="email"
            aria-describedby={problem ? `${uid}-p` : undefined}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {problem && (
          <p className="ts-invalid" id={`${uid}-p`}>
            {problem}
          </p>
        )}
        <div className="ts-row">
          <button type="submit" className="btn accent" disabled={!name.trim() || !email.trim()}>
            Save and try again
          </button>
          {onDismiss && (
            <button type="button" className="btn ghost" onClick={onDismiss}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </form>
  )
}

/** A repository address field with live, plain-language validation. */
function RepoUrlField({
  id,
  label,
  value,
  onChange,
  onSubmit
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  onSubmit?: () => void
}) {
  const check = validateRepoUrl(value)
  const showProblem = value.trim().length > 0 && !check.ok
  return (
    <div className="ts-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="url"
        value={value}
        spellCheck={false}
        autoComplete="off"
        placeholder="https://github.com/your-team/payments-api.git"
        aria-invalid={showProblem || undefined}
        aria-describedby={`${id}-hint${showProblem ? ` ${id}-problem` : ''}`}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && check.ok) onSubmit?.()
        }}
      />
      <div className="ts-hint" id={`${id}-hint`}>
        Copy it from the <b>Code</b> button on GitHub or <b>Clone</b> on GitLab. Examples:{' '}
        <code>https://github.com/your-team/payments-api.git</code> or{' '}
        <code>git@github.com:your-team/payments-api.git</code>
      </div>
      {showProblem && (
        <div className="ts-invalid" id={`${id}-problem`} aria-live="polite">
          {check.message}
          {check.fix && (
            <button type="button" className="ts-link" onClick={() => onChange(check.fix!)}>
              Use {check.fix}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// State for one collection
// ---------------------------------------------------------------------------

export type SyncAvailability = 'loading' | 'browser' | 'no-git' | 'ready'

export interface TeamSyncState {
  availability: SyncAvailability
  status: GitStatus | null
  conflict: boolean
  /** Progress text while an operation runs, else null. */
  busy: string | null
  error: SyncError | null
  setError: (e: SyncError | null) => void
  refresh: () => Promise<void>
  sync: (message?: string) => Promise<GitActionResult | null>
  /** Run any git call with a progress label; toasts the message, keeps errors on screen. */
  run: (
    label: string,
    call: () => Promise<GitActionResult>,
    opts?: { mutates?: boolean; quiet?: boolean }
  ) => Promise<GitActionResult | null>
}

export function useTeamSync(
  root: string | undefined,
  {
    onToast,
    onWorkingTreeChanged
  }: { onToast: (text: string) => void; onWorkingTreeChanged?: () => void }
): TeamSyncState {
  const [availability, setAvailability] = useState<SyncAvailability>('loading')
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<SyncError | null>(null)
  const conflicts = useConflictRoots()
  const conflict = !!root && conflicts.has(root)
  const epoch = useGitEpoch()

  const refresh = useCallback(async () => {
    if (!root || !window.tiger?.git) return setAvailability('browser')
    if (!(await window.tiger.git.check()).ok) return setAvailability('no-git')
    const next = await window.tiger.git.status(root)
    setStatus(next)
    setAvailability('ready')
  }, [root])

  // Refresh on mount and whenever another view changed a repository.
  useEffect(() => {
    void refresh()
  }, [refresh, epoch])

  const run = useCallback<TeamSyncState['run']>(
    async (label, call, opts = {}) => {
      setBusy(label)
      setError(null)
      announce(label)
      try {
        const result = await call()
        if (result.ok) {
          if (!opts.quiet) onToast(result.message)
          if (opts.mutates) onWorkingTreeChanged?.()
        } else {
          setError({ message: result.message, code: result.code })
          announce(result.message, { assertive: true })
        }
        notifyGitChanged()
        return result
      } finally {
        setBusy(null)
      }
    },
    [onToast, onWorkingTreeChanged]
  )

  const sync = useCallback(
    async (message = '') => {
      if (!root || !window.tiger?.git) return null
      setBusy(progressText(null))
      setError(null)
      announce(progressText(null))
      const stop = window.tiger.git.onProgress?.((event) => {
        if (event.root !== root) return
        setBusy(progressText(event.phase))
        announce(progressText(event.phase))
      })
      try {
        const result = await window.tiger.git.sync(root, message.trim())
        if (result.conflict) {
          setConflict(root, true)
          announce(
            'Conflict: you and a teammate changed the same request. Choose which version to keep.',
            {
              assertive: true
            }
          )
        } else if (result.ok) {
          setConflict(root, false)
          onToast(syncResultText(result))
          onWorkingTreeChanged?.()
        } else {
          // Stays on screen with the fix; a toast would vanish.
          setError({ message: result.message, code: result.code })
          announce(result.message, { assertive: true })
        }
        notifyGitChanged()
        return result
      } finally {
        stop?.()
        setBusy(null)
      }
    },
    [root, onToast, onWorkingTreeChanged]
  )

  return { availability, status, conflict, busy, error, setError, refresh, sync, run }
}

/** Progress line: role=status so the phase change is read out politely. */
export function ProgressLine({ text }: { text: string | null }) {
  return (
    <div className="ts-progress" role="status">
      {text && (
        <>
          <span className="ts-spinner" aria-hidden />
          {text}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Setup: share this collection with your team
// ---------------------------------------------------------------------------

const STEPS = [
  { title: 'Turn on version tracking', term: 'init' },
  { title: 'Connect a shared repository', term: 'remote add' },
  { title: 'Share it with your team', term: 'push' }
] as const

export function SetupStepper({ root, state }: { root: string; state: TeamSyncState }) {
  const uid = useId()
  const [url, setUrl] = useState('')
  const [remoteHasContent, setRemoteHasContent] = useState(false)
  const step = setupStep(state.status)
  if (step === null) return null
  const check = validateRepoUrl(url)

  const connect = async (): Promise<void> => {
    if (!check.ok) return
    const result = await state.run('Checking access to the repository…', () =>
      window.tiger!.git.setRemote(root, url.trim())
    )
    if (result?.ok) setRemoteHasContent(!!result.remoteHasContent)
  }

  return (
    <section className="ts-setup" aria-labelledby={`${uid}-h`}>
      <h3 className="ts-h" id={`${uid}-h`}>
        Share this collection with your team
      </h3>
      <ol className="ts-steps">
        {STEPS.map((s, i) => {
          const n = (i + 1) as 1 | 2 | 3
          const state_ = n < step ? 'done' : n === step ? 'current' : 'todo'
          return (
            <li
              key={s.title}
              className={`ts-step ${state_}`}
              aria-current={n === step ? 'step' : undefined}
            >
              <span className="ts-step-num" aria-hidden>
                {state_ === 'done' ? <CheckIcon size={13} /> : n}
              </span>
              <div className="ts-step-body">
                <div className="ts-step-title">
                  <b>{s.title}</b> <GitTerm>{s.term}</GitTerm>
                  <span className="sr-only">
                    {state_ === 'done'
                      ? ' (done)'
                      : state_ === 'current'
                        ? ' (current step)'
                        : ' (to do)'}
                  </span>
                </div>
                {n === 1 && step === 1 && (
                  <>
                    <p>
                      Tiger keeps a history of every change in this folder, so you can see who
                      changed what and go back. Nothing leaves your computer yet.
                    </p>
                    <button
                      type="button"
                      className="btn accent"
                      disabled={state.busy !== null}
                      onClick={() =>
                        state.run('Turning on version tracking…', () =>
                          window.tiger!.git.init(root)
                        )
                      }
                    >
                      Turn on version tracking
                    </button>
                  </>
                )}
                {n === 2 && step === 2 && (
                  <>
                    <p>
                      Create an empty repository on GitHub, GitLab or your company server (a
                      developer on your team can do this in a minute), then paste its address here.
                    </p>
                    <RepoUrlField
                      id={`${uid}-url`}
                      label="Repository address"
                      value={url}
                      onChange={setUrl}
                      onSubmit={connect}
                    />
                    <button
                      type="button"
                      className="btn accent"
                      disabled={state.busy !== null || !check.ok}
                      onClick={connect}
                    >
                      Connect
                    </button>
                  </>
                )}
                {n === 3 && step === 3 && (
                  <>
                    <p>
                      {remoteHasContent
                        ? 'The repository already has content: the first sync combines it with this collection.'
                        : 'Tiger saves a first version and uploads it. Teammates then use "Join a team collection" to get it.'}
                    </p>
                    <button
                      type="button"
                      className="btn accent"
                      disabled={state.busy !== null}
                      onClick={() => state.sync('Share collection with the team')}
                    >
                      <CloudUploadIcon size={14} /> Share now
                    </button>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Changes, grouped by request, with a diff per request
// ---------------------------------------------------------------------------

const GROUPS: Array<{
  key: keyof GroupedChanges
  title: string
  icon: (p: IconProps) => ReactNode
}> = [
  { key: 'added', title: 'Added', icon: PlusIcon },
  { key: 'changed', title: 'Changed', icon: PencilIcon },
  { key: 'removed', title: 'Removed', icon: TrashIcon }
]

/** Request names for the changed paths, read from disk (deleted: last version). */
export function useChangeGroups(root: string, status: GitStatus | null): GroupedChanges {
  const [names, setNames] = useState<Record<string, string>>({})
  const paths = useMemo(() => status?.changedFiles.map((f) => f.path) ?? [], [status])
  const key = paths.join('\n')
  useEffect(() => {
    let live = true
    if (!paths.length || !window.tiger?.git.requestNames) return
    window.tiger.git.requestNames(root, paths).then((n) => live && setNames(n))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, key])
  return useMemo(() => groupChanges(status?.changedFiles ?? [], names), [status, names])
}

function ChangeRow({
  root,
  item,
  onDiscard,
  disabled
}: {
  root: string
  item: ChangeItem
  onDiscard: (items: ChangeItem[]) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [diff, setDiff] = useState<string | null>(null)
  const uid = useId()
  const toggle = async (): Promise<void> => {
    const next = !open
    setOpen(next)
    if (next && diff === null && window.tiger?.git.diffFile)
      setDiff(await window.tiger.git.diffFile(root, item.path))
  }
  const lines = splitDiff(diff ?? '').filter((l) => l.kind !== 'meta')
  return (
    <li className="ts-change">
      <div className="ts-change-row">
        <button
          type="button"
          className="ts-change-name"
          aria-expanded={open}
          aria-controls={`${uid}-d`}
          title={item.path}
          onClick={toggle}
        >
          <ChevronIcon size={12} className={`chev ${open ? 'open' : ''}`} />
          <span className="row-label">{item.name}</span>
          {item.folder && <span className="ts-folder">{item.folder}</span>}
        </button>
        <button
          type="button"
          className="icon-btn ts-discard-one"
          disabled={disabled}
          title={`Discard changes to ${item.name}`}
          aria-label={`Discard changes to ${item.name}`}
          onClick={() => onDiscard([item])}
        >
          <UndoIcon size={13} />
        </button>
      </div>
      {open && (
        <div
          className="git-diff ts-diff"
          id={`${uid}-d`}
          role="region"
          aria-label={`Changes in ${item.name}`}
          tabIndex={0}
        >
          {diff === null ? (
            <div className="cv-dim">Loading…</div>
          ) : lines.length === 0 ? (
            <div className="cv-dim">No line changes (renamed or permissions only).</div>
          ) : (
            lines.map((line, i) => (
              <div key={i} className={`dl-${line.kind}`}>
                {line.text || ' '}
              </div>
            ))
          )}
        </div>
      )}
    </li>
  )
}

export function ChangeList({
  root,
  groups,
  busy,
  onDiscard
}: {
  root: string
  groups: GroupedChanges
  busy: boolean
  onDiscard: (items: ChangeItem[]) => void
}) {
  const uid = useId()
  return (
    <div className="ts-groups">
      {GROUPS.filter((g) => groups[g.key].length > 0).map((g) => {
        const Icon = g.icon
        return (
          <div key={g.key} className={`ts-group ts-${g.key}`}>
            <h4 id={`${uid}-${g.key}`}>
              <Icon size={13} /> {g.title}{' '}
              <span className="ts-count">({groups[g.key].length})</span>
            </h4>
            <ul aria-labelledby={`${uid}-${g.key}`}>
              {groups[g.key].map((item) => (
                <ChangeRow
                  key={item.path}
                  root={root}
                  item={item}
                  onDiscard={onDiscard}
                  disabled={busy}
                />
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

/** Confirm naming exactly what goes away. Cancel is focused first. */
export function DiscardConfirm({
  items,
  groups,
  onConfirm,
  onCancel
}: {
  items: ChangeItem[]
  groups: GroupedChanges
  onConfirm: () => void
  onCancel: () => void
}) {
  const kindOf = (item: ChangeItem): string =>
    groups.added.some((i) => i.path === item.path)
      ? 'new, will be deleted'
      : groups.removed.some((i) => i.path === item.path)
        ? 'removed, will come back'
        : 'edits will be lost'
  const title =
    items.length === 1 ? `Discard changes to ${items[0].name}?` : `Discard ${items.length} changes?`
  return (
    <Modal
      title={title}
      role="alertdialog"
      width={460}
      onClose={onCancel}
      description="These requests go back to the last saved version. You can undo this right after."
      footer={
        <>
          <button type="button" className="btn" data-autofocus onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn danger" onClick={onConfirm}>
            {items.length === 1 ? 'Discard' : `Discard ${items.length} changes`}
          </button>
        </>
      }
    >
      <ul className="ts-discard-list">
        {items.map((i) => (
          <li key={i.path} title={i.path}>
            <b>{i.name}</b> <span className="cv-dim">({kindOf(i)})</span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

/** Version note prefilled from the changes until the user types their own. */
export function useVersionNote(groups: GroupedChanges): {
  note: string
  suggested: boolean
  setNote: (v: string) => void
  reset: () => void
} {
  const [typed, setTyped] = useState<string | null>(null)
  const suggestion = suggestCommitMessage(groups)
  return {
    note: typed ?? suggestion,
    suggested: typed === null && suggestion.length > 0,
    setNote: setTyped,
    reset: () => setTyped(null)
  }
}

// ---------------------------------------------------------------------------
// Conflicts: your version / team's version, per request
// ---------------------------------------------------------------------------

function SideBySide({
  label,
  text,
  other
}: {
  label: string
  text: string | null
  other: string | null
}) {
  const lines = markDifferences(text, other)
  return (
    <div className="ts-side">
      <div className="ts-side-label">{label}</div>
      {text === null ? (
        <div className="ts-side-empty">Deleted in this version</div>
      ) : (
        <pre tabIndex={0} aria-label={label}>
          {lines.map((l, i) => (
            <span key={i} className={l.differs ? 'ts-differs' : undefined}>
              {l.text || ' '}
              {'\n'}
            </span>
          ))}
        </pre>
      )}
    </div>
  )
}

export function ConflictPanel({
  root,
  busy,
  onResolve,
  onLater
}: {
  root: string
  busy: boolean
  onResolve: (prefer: 'mine' | 'theirs', choices?: Record<string, 'mine' | 'theirs'>) => void
  onLater: () => void
}) {
  const uid = useId()
  const [items, setItems] = useState<GitConflict[] | null>(null)
  const [choices, setChoices] = useState<Record<string, 'mine' | 'theirs'>>({})
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    let live = true
    const load = window.tiger?.git.conflicts
    if (!load) return setItems([])
    load(root).then((c) => live && setItems(c))
    return () => {
      live = false
    }
  }, [root])
  useEffect(() => headingRef.current?.focus(), [])
  const all = items ?? []
  const decided = all.length > 0 && all.every((c) => choices[c.path])
  const setAll = (side: 'mine' | 'theirs'): void =>
    setChoices(Object.fromEntries(all.map((c) => [c.path, side])))

  return (
    <section className="ts-conflict" aria-labelledby={`${uid}-h`}>
      <h3 className="ts-h" id={`${uid}-h`} ref={headingRef} tabIndex={-1}>
        <WarningIcon size={15} /> You and a teammate changed the same{' '}
        {all.length === 1 ? 'request' : 'requests'}
      </h3>
      <p className="ts-explain">
        For each request, keep your version or the team's. Only the lines you both edited follow
        your choice; every other edit, from you or the team, is kept. The history keeps both
        versions.
      </p>
      {items === null && <div className="cv-dim">Loading the two versions…</div>}
      {all.map((c) => (
        <fieldset key={c.path} className="ts-conflict-item">
          <legend title={c.path}>{c.name}</legend>
          <div className="ts-sides">
            <SideBySide label="Your version" text={c.mine} other={c.theirs} />
            <SideBySide label="Team's version" text={c.theirs} other={c.mine} />
          </div>
          <div className="ts-row" role="group" aria-label={`Which version of ${c.name} to keep`}>
            <button
              type="button"
              className={`btn ${choices[c.path] === 'mine' ? 'accent' : ''}`}
              aria-pressed={choices[c.path] === 'mine'}
              onClick={() => setChoices((prev) => ({ ...prev, [c.path]: 'mine' }))}
            >
              {choices[c.path] === 'mine' && <CheckIcon size={14} />} Keep mine
            </button>
            <button
              type="button"
              className={`btn ${choices[c.path] === 'theirs' ? 'accent' : ''}`}
              aria-pressed={choices[c.path] === 'theirs'}
              onClick={() => setChoices((prev) => ({ ...prev, [c.path]: 'theirs' }))}
            >
              {choices[c.path] === 'theirs' && <CheckIcon size={14} />} Keep theirs
            </button>
          </div>
        </fieldset>
      ))}
      <div className="ts-row ts-conflict-actions">
        {all.length > 0 ? (
          <>
            <button
              type="button"
              className="btn accent"
              disabled={busy || !decided}
              onClick={() => onResolve('mine', choices)}
            >
              Finish sync
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setAll('mine')}>
              Keep all mine
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setAll('theirs')}>
              Keep all theirs
            </button>
          </>
        ) : (
          items !== null && (
            <>
              <button
                type="button"
                className="btn accent"
                disabled={busy}
                onClick={() => onResolve('mine')}
              >
                Keep my version
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => onResolve('theirs')}
              >
                Use the team's version
              </button>
            </>
          )
        )}
        <button type="button" className="btn ghost" disabled={busy} onClick={onLater}>
          Decide later
        </button>
      </div>
      {all.length > 0 && !decided && (
        <p className="ts-hint">Choose a version for each request to finish the sync.</p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Join a team collection (clone)
// ---------------------------------------------------------------------------

export function JoinTeamModal({
  onCancel,
  onJoined
}: {
  onCancel: () => void
  onJoined: (opened: OpenedCollection) => void
}) {
  const uid = useId()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<SyncError | null>(null)
  const check = validateRepoUrl(url)
  const join = async (): Promise<void> => {
    if (!check.ok || busy) return
    if (!window.tiger?.git) {
      setError({ message: 'Joining a team collection needs the Tiger desktop app.' })
      return
    }
    setBusy(true)
    setError(null)
    announce('Downloading the team collection…')
    try {
      const opened = await window.tiger.git.clone(url.trim())
      if (!opened) return // folder picker cancelled: stay here
      if ('error' in opened) {
        setError({ message: opened.error, code: opened.code })
        announce(opened.error, { assertive: true })
        return
      }
      onJoined(opened)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title={actionLabel('join-team')}
      onClose={onCancel}
      width={560}
      description="Get a copy of a collection your team shares in a git repository. You can then sync to get their changes and share yours."
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn accent" disabled={!check.ok || busy} onClick={join}>
            {busy ? 'Downloading…' : 'Choose folder and join'}
          </button>
        </>
      }
    >
      <ol className="ts-join-steps">
        <li>
          <RepoUrlField
            id={`${uid}-url`}
            label="1. Repository address"
            value={url}
            onChange={setUrl}
            onSubmit={join}
          />
        </li>
        <li>
          <b>2. Choose where to keep it on this computer.</b>{' '}
          <span className="cv-dim">Tiger creates a folder named after the repository there.</span>
        </li>
        <li>
          <b>3. It opens here</b> <span className="cv-dim">in the sidebar, ready to use.</span>{' '}
          <GitTerm>clone</GitTerm>
        </li>
      </ol>
      <ProgressLine text={busy ? 'Downloading the team collection…' : null} />
      {error && <ErrorPanel error={error} onRetry={check.ok ? join : undefined} />}
    </Modal>
  )
}
