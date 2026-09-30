import { useId, useState } from 'react'
import type { TigerAuth } from '@core/types'
import type { SidebarEntry } from './Sidebar'
import { AuthEditor } from './AuthEditor'
import { FolderIcon, PlayIcon, PlusIcon } from './Icons'
import './FolderView.css'
import './PageTabs.css'
import { rovingIndex } from '../a11y'
import { useT } from '../i18n'
import type { MessageKey } from '@core/i18n'

interface Props {
  collectionName: string
  /** Absolute collection root, when on disk; enables folder.tiger persistence. */
  root?: string
  path: string[]
  entries: SidebarEntry[]
  auth?: TigerAuth
  docs?: string
  onSelect: (id: string) => void
  onRun: () => void
  onNewRequest: () => void
  onSaveAuth: (auth: TigerAuth | undefined) => void
  onSaveDocs: (docs: string) => void
  onToast: (text: string) => void
}

type PageTab = 'requests' | 'docs' | 'auth'
const PAGE_TABS: { id: PageTab; labelKey: MessageKey }[] = [
  { id: 'requests', labelKey: 'views.tab.requests' },
  { id: 'docs', labelKey: 'views.tab.notes' },
  { id: 'auth', labelKey: 'views.tab.auth' }
]

/** Full-page view for a folder: docs, default auth, its requests. */
export function FolderView({
  collectionName,
  path,
  entries,
  auth,
  docs,
  onSelect,
  onRun,
  onNewRequest,
  onSaveAuth,
  onSaveDocs
}: Props) {
  const t = useT()
  const key = path.join('/')
  const [pageTab, setPageTab] = useState<PageTab>('requests')
  const uid = useId()
  const name = path[path.length - 1]
  const crumbs = [collectionName, ...path]
  return (
    <section className="panel collection-view" aria-labelledby={`${uid}-title`}>
      <div className="cv-head">
        <div className="cv-title">
          <h2 id={`${uid}-title`} title={name}>
            <FolderIcon size={18} /> <span className="cv-name">{name}</span>
          </h2>
          <nav aria-label={t('views.folder.pathLabel')} className="cv-path" title={crumbs.join(' / ')}>
            <ol className="cv-crumbs">
              {crumbs.map((c, i) => (
                <li key={i} aria-current={i === crumbs.length - 1 ? 'page' : undefined}>
                  {c}
                </li>
              ))}
            </ol>
          </nav>
        </div>
        <div className="cv-actions">
          <button type="button" className="btn accent" onClick={onNewRequest}>
            <PlusIcon size={14} /> {t('views.newRequest')}
          </button>
          <button type="button" className="btn" onClick={onRun} title={t('views.folder.runTitle')}>
            <PlayIcon size={14} /> {t('views.folder.run')}
          </button>
        </div>
      </div>

      <div className="cv-tabcard">
      <div className="tabs cv-tabs" role="tablist" aria-label={t('views.folder.tabsLabel')}>
        {PAGE_TABS.map((tab, i) => {
          const on = pageTab === tab.id
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
              {tab.id === 'requests' && (
                <>
                  {' '}
                  <span className="count">{entries.length}</span>
                </>
              )}
              {tab.id === 'docs' && !!docs?.trim() && (
                <>
                  {' '}
                  <span className="dot" aria-hidden />
                  <span className="sr-only">{t('views.tab.written')}</span>
                </>
              )}
              {tab.id === 'auth' && !!auth && auth.type !== 'none' && (
                <>
                  {' '}
                  <span className="dot" aria-hidden />
                  <span className="sr-only">{t('views.tab.set')}</span>
                </>
              )}
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
      {pageTab === 'docs' && (
        <div className="cv-card">
          <textarea
            className="docs-area"
            aria-label={t('views.folder.docsLabel')}
            placeholder={t('views.folder.docsPlaceholder')}
            defaultValue={docs ?? ''}
            key={`docs-${key}`}
            spellCheck={false}
            onBlur={(e) => {
              if (e.target.value !== (docs ?? '')) onSaveDocs(e.target.value)
            }}
          />
        </div>
      )}

      {pageTab === 'auth' && (
        <>
          <h3 className="section-label">{t('views.folder.authHeading')}</h3>
          <div className="cv-card">
            <AuthEditor noInherit auth={auth} onChange={onSaveAuth} />
          </div>
        </>
      )}

      {pageTab === 'requests' && (
        <>
      <h3 className="section-label">
        {t('views.folder.heading', { count: entries.length })}
      </h3>
      <div className="cv-card">
        {entries.length === 0 ? (
          <div className="cv-empty">
            <b>{t('views.folder.emptyTitle')}</b>
            <div className="cv-dim">{t('views.folder.emptyHint')}</div>
            <button type="button" className="btn accent" onClick={onNewRequest}>
              <PlusIcon size={14} /> {t('views.folder.createFirst')}
            </button>
          </div>
        ) : (
          <ul className="cv-req-list" role="list">
            {entries.map((e) => (
              <li key={e.id}>
                <button type="button" className="cv-req-row" onClick={() => onSelect(e.id)} title={e.name}>
                  <span className={`method-pill m-${e.method}`}>{e.method.toUpperCase()}</span>
                  <span className="row-label">{e.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
        </>
      )}
      </div>
      </div>
    </section>
  )
}
