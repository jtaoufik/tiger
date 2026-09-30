import { useId, useState } from 'react'
import type { TigerAuth } from '@core/types'
import type { HistoryEntry } from '../../../main/history'
import { AuthEditor } from './AuthEditor'
import { REVEAL_LABEL_KEY } from '../platform'
import { useT } from '../i18n'
import { emphasize } from '../emphasize'
import type { MessageKey } from '@core/i18n'
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
const PAGE_TABS: { id: PageTab; labelKey: MessageKey }[] = [
  { id: 'overview', labelKey: 'views.tab.overview' },
  { id: 'docs', labelKey: 'views.tab.notes' },
  { id: 'auth', labelKey: 'views.tab.auth' },
  { id: 'activity', labelKey: 'views.tab.activity' }
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
  const t = useT()
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
              aria-label={t('views.collection.syncPill', { label: summary.label })}
              title={summary.detail}
              onClick={onOpenGitDetails}
            >
              <SyncBadge summary={summary} />
            </button>
          )}
        </div>
        <div className="cv-actions">
          <button type="button" className="btn accent" onClick={onNewRequest}>
            <PlusIcon size={14} /> {t('views.newRequest')}
          </button>
          <button type="button" className="btn" onClick={onRun} title={actionTitle('run-collection')}>
            <PlayIcon size={14} /> {actionLabel('run-collection')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={onImportExport}
            title={t('views.collection.exportTitle')}
          >
            <DownloadIcon size={14} /> {actionLabel('export')}
          </button>
          {collection.root && (
            <button
              type="button"
              className="icon-btn"
              title={t(REVEAL_LABEL_KEY)}
              aria-label={t(REVEAL_LABEL_KEY)}
              onClick={() => window.tiger?.reveal?.(collection.root!)}
            >
              <FolderOpenIcon />
            </button>
          )}
          <button
            type="button"
            className="icon-btn danger"
            title={t('views.collection.closeTitle')}
            aria-label={t('views.collection.closeLabel')}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
          <HelpLink page="collections" topic={t('views.collection.helpTopic')} />
        </div>
      </div>

      <div className="cv-stats">
        <span>
          {emphasize(
            t('common.requests', { count: collection.requestCount }),
            t.number(collection.requestCount)
          )}
        </span>
        <span>
          {emphasize(t('common.folders', { count: collection.folderCount }), t.number(collection.folderCount))}
        </span>
        <span>
          {emphasize(
            t('common.environments', { count: collection.environments.length }),
            t.number(collection.environments.length)
          )}
          {collection.environments.length > 0 && (
            <span className="cv-dim"> · {collection.environments.join(', ')}</span>
          )}
        </span>
      </div>

      <div className="cv-tabcard">
      <div className="tabs cv-tabs" role="tablist" aria-label={t('views.collection.tabsLabel')}>
        {PAGE_TABS.map((tab, i) => {
          const on = pageTab === tab.id
          const marker =
            tab.id === 'docs' && collection.docs?.trim() ? (
              <>
                {' '}
                <span className="dot" aria-hidden />
                <span className="sr-only">{t('views.tab.written')}</span>
              </>
            ) : tab.id === 'auth' && collection.auth && collection.auth.type !== 'none' ? (
              <>
                {' '}
                <span className="dot" aria-hidden />
                <span className="sr-only">{t('views.tab.set')}</span>
              </>
            ) : tab.id === 'activity' && history.length > 0 ? (
              <>
                {' '}
                <span className="count">{Math.min(history.length, 8)}</span>
              </>
            ) : null
          return (
            <button
              type="button"
              key={tab.id}
              role="tab"
              id={`${uid}-tab-${tab.id}`}
              aria-selected={on}
              aria-controls={`${uid}-panel`}
              tabIndex={on ? 0 : -1}
              className={`tab ${on ? 'active' : ''}`}
              onClick={() => setPageTab(tab.id)}
              onKeyDown={(e) => {
                const next = rovingIndex(e.key, i, PAGE_TABS.length)
                if (next === null) return
                e.preventDefault()
                setPageTab(PAGE_TABS[next].id)
                ;(e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus()
              }}
            >
              {t(tab.labelKey)}
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
      <h3 className="section-label">{t('views.collection.teamSync')}</h3>
      <div className="cv-card" aria-busy={sync.busy !== null || sync.availability === 'loading' || undefined}>
        {sync.availability === 'loading' && <div className="cv-dim">{t('views.collection.checking')}</div>}

        {sync.availability === 'browser' && (
          <div className="cv-dim">
            {collection.root
              ? t('views.collection.desktopOnly')
              : t('views.collection.inMemory')}
          </div>
        )}

        {sync.availability === 'no-git' && (
          <div className="cv-sync-row">
            <div>
              <b>{t('views.collection.installGit')}</b>
              <div className="cv-dim">{t('views.collection.installGitHint')}</div>
            </div>
            <button
              type="button"
              className="btn accent"
              onClick={() => window.tiger?.openExternal?.('https://git-scm.com/downloads')}
            >
              {t('views.collection.downloadGit')}
            </button>
            <button type="button" className="icon-btn" title={t('views.collection.checkAgain')} aria-label={t('views.collection.checkAgainGit')} onClick={sync.refresh}>
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
                  {t('views.collection.chooseVersions')}
                </button>
              ) : step !== null ? (
                <button type="button" className="btn accent" onClick={onOpenGitDetails}>
                  <UsersIcon size={14} /> {step === 1
                    ? t('views.collection.withEllipsis', { label: actionLabel('share-collection') })
                    : t('views.collection.continueSetup')}
                </button>
              ) : (
                <button type="button" className="btn accent" disabled={sync.busy !== null} onClick={doSync}>
                  <RefreshIcon size={14} /> {actionLabel('sync')}
                </button>
              )}
              {!sync.conflict && (
                <button type="button" className="btn ghost" onClick={onOpenGitDetails}>
                  {sync.status.dirtyCount > 0 ? t('views.collection.seeChanges') : t('views.collection.details')}
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
            aria-label={t('views.collection.docsLabel')}
            placeholder={t('views.collection.docsPlaceholder')}
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
          <h3 className="section-label">{t('views.collection.authHeading')}</h3>
          <div className="cv-card">
            <AuthEditor noInherit auth={collection.auth} onChange={onSaveAuth} />
          </div>
        </>
      )}

      {pageTab === 'activity' && (
        <>
      <h3 className="section-label">
        <ClockIcon size={12} /> {t('views.collection.activityHeading')}
      </h3>
      <div className="cv-card">
        {history.length === 0 ? (
          <div className="cv-dim">{t('views.collection.noActivity')}</div>
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
              <span className="meta-chip">{t('common.ms', { value: e.timeMs })}</span>
            </div>
          ))
        )}
        {history.length === 0 && (
          <div className="cv-empty-actions">
            <span className="cv-dim">
              <CheckIcon size={11} /> {t('views.collection.activityHint')}
            </span>
            <button type="button" className="btn" onClick={onNewRequest}>
              <PlusIcon size={14} /> {t('views.newRequest')}
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
