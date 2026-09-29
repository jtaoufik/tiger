import { useId, useState } from 'react'
import type { TigerAuth } from '@core/types'
import type { HistoryEntry } from '../../../main/history'
import { AuthEditor } from './AuthEditor'
import { REVEAL_LABEL } from '../platform'
import { rovingIndex } from '../a11y'
import { setupStep, summarizeSync } from '../gitUx'
import { ErrorPanel, ProgressLine, SyncBadge, useTeamSync } from './TeamSync'
import './PageTabs.css'
import {
  CheckIcon,
  ClockIcon,
  CloseIcon,
  DownloadIcon,
  FolderOpenIcon,
  PlayIcon,
  PlusIcon,
  RefreshIcon,
  UsersIcon
} from './Icons'
import { actionTitle, actionLabel } from '../actions'
import { HelpLink } from './HelpLink'

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

type PageTab = 'overview' | 'docs' | 'auth' | 'activity'
const PAGE_TABS: { id: PageTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'docs', label: 'Notes' },
  { id: 'auth', label: 'Auth' },
  { id: 'activity', label: 'Activity' }
]

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
  const [pageTab, setPageTab] = useState<PageTab>('overview')
  const uid = useId()
  const sync = useTeamSync(collection.root, { onToast, onWorkingTreeChanged })
  const summary = summarizeSync(sync.status, { conflict: sync.conflict })
  const step = setupStep(sync.status)

  /** Sync from the page; a conflict opens the dialog where both versions show. */
  const doSync = async (): Promise<void> => {
    const result = await sync.sync()
    if (result?.conflict) onOpenGitDetails()
  }

  return (
    <section className="panel collection-view" aria-labelledby={`${uid}-title`}>
      <div className="cv-head">
        <div className="cv-title">
          <h2 id={`${uid}-title`} title={collection.name}>
            <span className="cv-name">{collection.name}</span>
          </h2>
          {collection.root && (
            <div className="cv-path" title={collection.root}>
              {collection.root}
            </div>
          )}
          {collection.root && sync.availability === 'ready' && (
            <button
              type="button"
              className="ts-pill"
              aria-label={`Team sync: ${summary.label}. Open team sync`}
              title={summary.detail}
              onClick={onOpenGitDetails}
            >
              <SyncBadge summary={summary} />
            </button>
          )}
        </div>
        <div className="cv-actions">
          <button type="button" className="btn accent" onClick={onNewRequest}>
            <PlusIcon size={14} /> New request
          </button>
          <button type="button" className="btn" onClick={onRun} title={actionTitle('run-collection')}>
            <PlayIcon size={14} /> {actionLabel('run-collection')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={onImportExport}
            title="Export this collection as Postman or OpenAPI"
          >
            <DownloadIcon size={14} /> {actionLabel('export')}
          </button>
          {collection.root && (
            <button
              type="button"
              className="icon-btn"
              title={REVEAL_LABEL}
              aria-label={REVEAL_LABEL}
              onClick={() => window.tiger?.reveal?.(collection.root!)}
            >
              <FolderOpenIcon />
            </button>
          )}
          <button
            type="button"
            className="icon-btn danger"
            title="Close collection (the files stay on disk)"
            aria-label="Close collection"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
          <HelpLink page="collections" topic="Collections" />
        </div>
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
      <div className="tabs cv-tabs" role="tablist" aria-label="Collection sections">
        {PAGE_TABS.map((t, i) => {
          const on = pageTab === t.id
          const marker =
            t.id === 'docs' && collection.docs?.trim() ? (
              <>
                {' '}
                <span className="dot" aria-hidden />
                <span className="sr-only">(written)</span>
              </>
            ) : t.id === 'auth' && collection.auth && collection.auth.type !== 'none' ? (
              <>
                {' '}
                <span className="dot" aria-hidden />
                <span className="sr-only">(set)</span>
              </>
            ) : t.id === 'activity' && history.length > 0 ? (
              <>
                {' '}
                <span className="count">{Math.min(history.length, 8)}</span>
              </>
            ) : null
          return (
            <button
              type="button"
              key={t.id}
              role="tab"
              id={`${uid}-tab-${t.id}`}
              aria-selected={on}
              aria-controls={`${uid}-panel`}
              tabIndex={on ? 0 : -1}
              className={`tab ${on ? 'active' : ''}`}
              onClick={() => setPageTab(t.id)}
              onKeyDown={(e) => {
                const next = rovingIndex(e.key, i, PAGE_TABS.length)
                if (next === null) return
                e.preventDefault()
                setPageTab(PAGE_TABS[next].id)
                ;(e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus()
              }}
            >
              {t.label}
              {marker}
            </button>
          )
        })}
      </div>
      <div
        className="cv-tabbody"
        role="tabpanel"
        id={`${uid}-panel`}
        aria-labelledby={`${uid}-tab-${pageTab}`}
      >
      {pageTab === 'overview' && (
        <>
      <h3 className="section-label">Team sync</h3>
      <div className="cv-card" aria-busy={sync.busy !== null || sync.availability === 'loading' || undefined}>
        {sync.availability === 'loading' && <div className="cv-dim">Checking…</div>}

        {sync.availability === 'browser' && (
          <div className="cv-dim">
            {collection.root
              ? 'Sync is available in the desktop app.'
              : 'This collection lives in memory. Open a folder from disk to sync it with your team.'}
          </div>
        )}

        {sync.availability === 'no-git' && (
          <div className="cv-sync-row">
            <div>
              <b>Install Git to enable team sync.</b>
              <div className="cv-dim">One install, no restart needed afterwards.</div>
            </div>
            <button
              type="button"
              className="btn accent"
              onClick={() => window.tiger?.openExternal?.('https://git-scm.com/downloads')}
            >
              Download Git
            </button>
            <button type="button" className="icon-btn" title="Check again" aria-label="Check again for Git" onClick={sync.refresh}>
              <RefreshIcon size={14} />
            </button>
          </div>
        )}

        {sync.availability === 'ready' && sync.status && (
          <>
            <div className="cv-sync-row">
              <div>
                <SyncBadge summary={summary} />
                <div className="cv-dim cv-sync-detail">{summary.detail}</div>
              </div>
              {sync.conflict ? (
                <button type="button" className="btn accent" onClick={onOpenGitDetails}>
                  Choose versions…
                </button>
              ) : step !== null ? (
                <button type="button" className="btn accent" onClick={onOpenGitDetails}>
                  <UsersIcon size={14} /> {step === 1 ? `${actionLabel('share-collection')}…` : 'Continue setup…'}
                </button>
              ) : (
                <button type="button" className="btn accent" disabled={sync.busy !== null} onClick={doSync}>
                  <RefreshIcon size={14} /> {actionLabel('sync')}
                </button>
              )}
              {!sync.conflict && (
                <button type="button" className="btn ghost" onClick={onOpenGitDetails}>
                  {sync.status.dirtyCount > 0 ? 'See changes' : 'Details'}
                </button>
              )}
            </div>
            <ProgressLine text={sync.busy} />
            {sync.error && (
              <ErrorPanel
                error={sync.error}
                root={collection.root}
                onRetry={() => {
                  sync.setError(null)
                  void doSync()
                }}
                onDismiss={() => sync.setError(null)}
              />
            )}
          </>
        )}
      </div>

        </>
      )}

      {pageTab === 'docs' && (
        <div className="cv-card">
          <textarea
            className="docs-area"
            aria-label="Collection docs (Markdown)"
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
          <h3 className="section-label">Default auth (inherited by requests)</h3>
          <div className="cv-card">
            <AuthEditor noInherit auth={collection.auth} onChange={onSaveAuth} />
          </div>
        </>
      )}

      {pageTab === 'activity' && (
        <>
      <h3 className="section-label">
        <ClockIcon size={12} /> Recent activity in this collection
      </h3>
      <div className="cv-card">
        {history.length === 0 ? (
          <div className="cv-dim">No requests sent yet from this collection.</div>
        ) : (
          history.slice(0, 8).map((e) => (
            <div className="hist-row" key={e.id}>
              <span className={`method-pill m-${e.method.toLowerCase()}`}>{e.method}</span>
              <span className="url" title={e.url}>
                {e.url}
              </span>
              <span className={e.ok ? 'status-ok' : 'status-bad'} style={{ fontWeight: 700 }}>
                {e.status}
              </span>
              <span className="meta-chip">{e.timeMs} ms</span>
            </div>
          ))
        )}
        {history.length === 0 && (
          <div className="cv-empty-actions">
            <span className="cv-dim">
              <CheckIcon size={11} /> Activity appears here as the team works.
            </span>
            <button type="button" className="btn" onClick={onNewRequest}>
              <PlusIcon size={14} /> New request
            </button>
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
