import type { TigerAuth } from '@core/types'
import type { SidebarEntry } from './Sidebar'
import { AuthEditor } from './AuthEditor'
import { FolderIcon, PlayIcon, PlusIcon } from './Icons'

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
  return (
    <section className="panel collection-view">
      <div className="cv-head">
        <div>
          <h2>
            <FolderIcon size={18} /> {path[path.length - 1]}
          </h2>
          <div className="cv-path">
            {collectionName} / {path.join(' / ')}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={onRun} title="Run every request in this folder">
          <PlayIcon size={14} /> Run
        </button>
        <button className="btn accent" onClick={onNewRequest}>
          <PlusIcon size={14} /> New request here
        </button>
      </div>

      <div className="section-label">Documentation</div>
      <div className="cv-card">
        <textarea
          className="docs-area"
          placeholder="Document this folder in Markdown…"
          defaultValue={docs ?? ''}
          key={`docs-${key}`}
          spellCheck={false}
          onBlur={(e) => {
            if (e.target.value !== (docs ?? '')) onSaveDocs(e.target.value)
          }}
        />
      </div>

      <div className="section-label">Default auth (inherited by requests in this folder)</div>
      <div className="cv-card">
        <AuthEditor noInherit auth={auth} onChange={onSaveAuth} />
      </div>

      <div className="section-label">
        {entries.length} request{entries.length === 1 ? '' : 's'} in this folder
      </div>
      <div className="cv-card">
        {entries.length === 0 ? (
          <div className="cv-dim">Empty folder. Create the first request here.</div>
        ) : (
          entries.map((e) => (
            <div className="tree-row" key={e.id} onClick={() => onSelect(e.id)}>
              <span className={`method-pill m-${e.method}`}>{e.method.toUpperCase()}</span>
              <span className="row-label">{e.name}</span>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
