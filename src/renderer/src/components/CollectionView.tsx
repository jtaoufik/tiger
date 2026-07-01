import { useCallback, useEffect, useState } from 'react'
import type { TigerAuth } from '@core/types'
import type { GitStatus } from '../../../main/git'
import type { HistoryEntry } from '../../../main/history'
import { AuthEditor } from './AuthEditor'
import { REVEAL_LABEL } from '../platform'
import './PageTabs.css'
import {
  CheckIcon,
  ClockIcon,
  FolderOpenIcon,
  GitBranchIcon,
  PlayIcon,
  PlusIcon,
  RefreshIcon,
  SwapIcon,
  TrashIcon
} from './Icons'

export interface CollectionInfo {
  id: string
  name: string
  root?: string
  requestCount: number
  folderCount: number
  environments: string[]
  auth?: TigerAuth
  docs?: string
}

interface Props {
  collection: CollectionInfo
  history: HistoryEntry[]
  onToast: (text: string) => void
  onSaveAuth: (auth: TigerAuth | undefined) => void
  onSaveDocs: (docs: string) => void
  onRun: () => void
  onNewRequest: () => void
  onImportExport: () => void
  onClose: () => void
  onOpenGitDetails: () => void
  /** Sync can rewrite .tiger files on disk; App must drop stale in-memory copies. */
  onWorkingTreeChanged?: () => void
}

type SyncScreen = 'loading' | 'browser' | 'no-git' | 'no-repo' | 'no-remote' | 'ready'

/**
 * Full-page view for a collection: team sync first, then auth, contents and
 * recent activity. Opened by clicking the collection in the sidebar.
 */
export function CollectionView({
  collection,
  history,
  onToast,
  onSaveAuth,
  onSaveDocs,
  onRun,
  onNewRequest,
  onImportExport,
  onClose,
  onOpenGitDetails,
  onWorkingTreeChanged
}: Props) {
  const [pageTab, setPageTab] = useState<'overview' | 'docs' | 'auth' | 'activity'>('overview')
  const [screen, setScreen] = useState<SyncScreen>('loading')
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [remoteUrl, setRemoteUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState(false)

  const refresh = useCallback(async () => {
    if (!collection.root || !window.tiger?.git) return setScreen('browser')
    if (!(await window.tiger.git.check()).ok) return setScreen('no-git')
    const next = await window.tiger.git.status(collection.root)
    setStatus(next)
    if (!next.isRepo) return setScreen('no-repo')
    setScreen(next.hasRemote ? 'ready' : 'no-remote')
  }, [collection.root])

  useEffect(() => {
    refresh()
  }, [refresh])

  const act = useCallback(
    async (run: () => Promise<{ ok: boolean; message: string }>) => {
      setBusy(true)
      try {
        const result = await run()
        onToast(result.message)
        await refresh()
      } finally {
        setBusy(false)
      }
    },
    [onToast, refresh]
  )

  /** One-button sync; a conflict flips the card to "keep mine / take theirs". */
  const doSync = useCallback(async () => {
    setBusy(true)
    try {
      const result = await window.tiger!.git.sync(collection.root!, '')
      if (result.conflict) {
        setConflict(true)
      } else {
        onToast(result.message)
        if (result.ok) onWorkingTreeChanged?.()
      }
      await refresh()
    } finally {
      setBusy(false)
    }
  }, [collection.root, onToast, onWorkingTreeChanged, refresh])

  const doResolve = useCallback(
    async (prefer: 'mine' | 'theirs') => {
      setBusy(true)
      try {
        const result = await window.tiger!.git.syncResolve(collection.root!, prefer, '')
        onToast(result.message)
        if (result.ok) {
          setConflict(false)
          onWorkingTreeChanged?.()
        }
        await refresh()
      } finally {
        setBusy(false)
      }
    },
    [collection.root, onToast, onWorkingTreeChanged, refresh]
  )

  const summary = !status
    ? ''
    : status.dirtyCount > 0
      ? `${status.dirtyCount} change${status.dirtyCount > 1 ? 's' : ''} not yet shared with the team.`
      : status.behind > 0
        ? `Your team made ${status.behind} update${status.behind > 1 ? 's' : ''} you don't have yet.`
        : status.ahead > 0
          ? `${status.ahead} update${status.ahead > 1 ? 's' : ''} ready to share.`
          : 'Everything is in sync with your team.'

  return (
    <section className="panel collection-view">
      <div className="cv-head">
        <div>
          <h2>{collection.name}</h2>
          {collection.root && <div className="cv-path">{collection.root}</div>}
        </div>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={onRun} title="Run every request in this collection">
          <PlayIcon size={14} /> Run
        </button>
        <button className="btn" onClick={onNewRequest}>
          <PlusIcon size={14} /> New request
        </button>
        <button className="btn" onClick={onImportExport}>
          <SwapIcon size={14} /> Import / Export
        </button>
        {collection.root && (
          <button
            className="icon-btn"
            title={REVEAL_LABEL}
            onClick={() => window.tiger?.reveal?.(collection.root!)}
          >
            <FolderOpenIcon />
          </button>
        )}
        <button className="icon-btn danger" title="Close collection" onClick={onClose}>
          <TrashIcon />
        </button>
      </div>

      <div className="cv-stats">
        <span>
          <b>{collection.requestCount}</b> request{collection.requestCount === 1 ? '' : 's'}
        </span>
        <span>
          <b>{collection.folderCount}</b> folder{collection.folderCount === 1 ? '' : 's'}
        </span>
        <span>
          <b>{collection.environments.length}</b> environment
          {collection.environments.length === 1 ? '' : 's'}
          {collection.environments.length > 0 && (
            <span className="cv-dim"> · {collection.environments.join(', ')}</span>
          )}
        </span>
      </div>

      <div className="cv-tabcard">
      <div className="tabs cv-tabs">
        <button
          className={`tab ${pageTab === 'overview' ? 'active' : ''}`}
          onClick={() => setPageTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab ${pageTab === 'docs' ? 'active' : ''}`}
          onClick={() => setPageTab('docs')}
        >
          Docs {!!collection.docs?.trim() && <span className="dot" />}
        </button>
        <button
          className={`tab ${pageTab === 'auth' ? 'active' : ''}`}
          onClick={() => setPageTab('auth')}
        >
          Auth {!!collection.auth && collection.auth.type !== 'none' && <span className="dot" />}
        </button>
        <button
          className={`tab ${pageTab === 'activity' ? 'active' : ''}`}
          onClick={() => setPageTab('activity')}
        >
          Activity {history.length > 0 && <span className="count">{Math.min(history.length, 8)}</span>}
        </button>
      </div>
      <div className="cv-tabbody">
      {pageTab === 'overview' && (
        <>
      <div className="section-label">Team sync</div>
      <div className="cv-card">
        {screen === 'loading' && <div className="cv-dim">Checking…</div>}

        {screen === 'browser' && (
          <div className="cv-dim">
            {collection.root
              ? 'Sync is available in the desktop app.'
              : 'This collection lives in memory. Open a folder from disk to sync it with your team.'}
          </div>
        )}

        {screen === 'no-git' && (
          <div className="cv-sync-row">
            <div>
              <b>Install Git to enable team sync.</b>
              <div className="cv-dim">One install, no restart needed afterwards.</div>
            </div>
            <button
              className="btn accent"
              onClick={() => window.tiger?.openExternal?.('https://git-scm.com/downloads')}
            >
              Download Git
            </button>
            <button className="icon-btn" title="Check again" onClick={refresh}>
              <RefreshIcon size={14} />
            </button>
          </div>
        )}

        {screen === 'no-repo' && (
          <div className="cv-sync-row">
            <div>
              <b>Track changes in this collection.</b>
              <div className="cv-dim">
                Step 1 of 2: turn on change tracking. Nothing leaves your machine yet.
              </div>
            </div>
            <button
              className="btn accent"
              disabled={busy}
              onClick={() => act(() => window.tiger!.git.init(collection.root!))}
            >
              <GitBranchIcon size={14} /> Turn on tracking
            </button>
          </div>
        )}

        {screen === 'no-remote' && (
          <div>
            <b>Step 2 of 2: connect a shared repository.</b>
            <div className="cv-dim" style={{ margin: '4px 0 10px' }}>
              Create an empty repository on GitHub, GitLab or your company server, then paste
              its URL here. Tiger publishes the collection and keeps it in sync.
            </div>
            <div className="cv-remote-row">
              <input
                placeholder="https://github.com/your-team/payments-api.git"
                value={remoteUrl}
                spellCheck={false}
                onChange={(e) => setRemoteUrl(e.target.value)}
              />
              <button
                className="btn accent"
                disabled={busy || !remoteUrl.trim()}
                onClick={() => act(() => window.tiger!.git.setRemote(collection.root!, remoteUrl))}
              >
                {busy ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          </div>
        )}

        {screen === 'ready' && status && conflict && (
          <div className="git-conflict">
            <b>You and a teammate changed the same thing.</b>
            <p>
              Pick whose version to keep where the changes overlap. Everything that doesn't
              overlap is combined automatically, and the team's history keeps both.
            </p>
            <div className="git-conflict-actions">
              <button className="btn accent" disabled={busy} onClick={() => doResolve('mine')}>
                {busy ? 'Working…' : 'Keep my version'}
              </button>
              <button className="btn" disabled={busy} onClick={() => doResolve('theirs')}>
                Use the team's version
              </button>
              <button className="btn ghost" disabled={busy} onClick={() => setConflict(false)}>
                Decide later
              </button>
            </div>
          </div>
        )}

        {screen === 'ready' && status && !conflict && (
          <div className="cv-sync-row">
            <div>
              <b>{summary}</b>
              {status.dirtyCount > 0 && (
                <div className="cv-dim">{status.dirtyCount} file(s) changed</div>
              )}
            </div>
            <button className="btn accent" disabled={busy} onClick={doSync}>
              {busy ? 'Syncing…' : 'Sync now'}
            </button>
            <button className="btn ghost" onClick={onOpenGitDetails}>
              Details
            </button>
            <button className="icon-btn" title="Refresh" onClick={refresh}>
              <RefreshIcon size={14} />
            </button>
          </div>
        )}
      </div>

        </>
      )}

      {pageTab === 'docs' && (
        <div className="cv-card">
          <textarea
            className="docs-area"
            placeholder="Document this collection in Markdown: what it covers, how to authenticate, gotchas…"
            defaultValue={collection.docs ?? ''}
            key={collection.id}
            spellCheck={false}
            onBlur={(e) => {
              if (e.target.value !== (collection.docs ?? '')) onSaveDocs(e.target.value)
            }}
          />
        </div>
      )}

      {pageTab === 'auth' && (
        <>
          <div className="section-label">Default auth (inherited by requests)</div>
          <div className="cv-card">
            <AuthEditor noInherit auth={collection.auth} onChange={onSaveAuth} />
          </div>
        </>
      )}

      {pageTab === 'activity' && (
        <>
      <div className="section-label">
        <ClockIcon size={12} /> Recent activity in this collection
      </div>
      <div className="cv-card">
        {history.length === 0 ? (
          <div className="cv-dim">No requests sent yet from this collection.</div>
        ) : (
          history.slice(0, 8).map((e) => (
            <div className="hist-row" key={e.id}>
              <span className={`method-pill m-${e.method.toLowerCase()}`}>{e.method}</span>
              <span className="url">{e.url}</span>
              <span className={e.ok ? 'status-ok' : 'status-bad'} style={{ fontWeight: 700 }}>
                {e.status}
              </span>
              <span className="meta-chip">{e.timeMs} ms</span>
            </div>
          ))
        )}
        {history.length === 0 && (
          <div className="cv-dim" style={{ marginTop: 4 }}>
            <CheckIcon size={11} /> Activity appears here as the team works.
          </div>
        )}
      </div>
        </>
      )}
      </div>
      </div>
    </section>
  )
}
