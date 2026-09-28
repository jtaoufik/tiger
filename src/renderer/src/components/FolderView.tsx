import { useId, useState } from 'react'
import type { TigerAuth } from '@core/types'
import type { SidebarEntry } from './Sidebar'
import { AuthEditor } from './AuthEditor'
import { FolderIcon, PlayIcon, PlusIcon } from './Icons'
import './FolderView.css'
import './PageTabs.css'
import { rovingIndex } from '../a11y'

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
const PAGE_TABS: { id: PageTab; label: string }[] = [
  { id: 'requests', label: 'Requests' },
  { id: 'docs', label: 'Docs' },
  { id: 'auth', label: 'Auth' }
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
          <nav aria-label="Folder path" className="cv-path" title={crumbs.join(' / ')}>
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
            <PlusIcon size={14} /> New request here
          </button>
          <button type="button" className="btn" onClick={onRun} title="Run every request in this folder">
            <PlayIcon size={14} /> Run
          </button>
        </div>
      </div>

      <div className="cv-tabcard">
      <div className="tabs cv-tabs" role="tablist" aria-label="Folder sections">
        {PAGE_TABS.map((t, i) => {
          const on = pageTab === t.id
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
              {t.id === 'requests' && (
                <>
                  {' '}
                  <span className="count">{entries.length}</span>
                </>
              )}
              {t.id === 'docs' && !!docs?.trim() && (
                <>
                  {' '}
                  <span className="dot" aria-hidden />
                  <span className="sr-only">(written)</span>
                </>
              )}
              {t.id === 'auth' && !!auth && auth.type !== 'none' && (
                <>
                  {' '}
                  <span className="dot" aria-hidden />
                  <span className="sr-only">(set)</span>
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
            aria-label="Folder docs (Markdown)"
            placeholder="Document this folder in Markdown…"
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
          <h3 className="section-label">Default auth (inherited by requests in this folder)</h3>
          <div className="cv-card">
            <AuthEditor noInherit auth={auth} onChange={onSaveAuth} />
          </div>
        </>
      )}

      {pageTab === 'requests' && (
        <>
      <h3 className="section-label">
        {entries.length} request{entries.length === 1 ? '' : 's'} in this folder
      </h3>
      <div className="cv-card">
        {entries.length === 0 ? (
          <div className="cv-empty">
            <b>This folder is empty.</b>
            <div className="cv-dim">Requests you add here inherit this folder's auth and docs.</div>
            <button type="button" className="btn accent" onClick={onNewRequest}>
              <PlusIcon size={14} /> Create the first request
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
