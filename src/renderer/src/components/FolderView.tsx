import type { SidebarEntry } from './Sidebar'
import { FolderIcon, PlusIcon } from './Icons'

interface Props {
  collectionName: string
  path: string[]
  entries: SidebarEntry[]
  onSelect: (id: string) => void
  onNewRequest: () => void
}

/** Full-page view for a folder: its requests, plus new-request-here. */
export function FolderView({ collectionName, path, entries, onSelect, onNewRequest }: Props) {
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
        <button className="btn accent" onClick={onNewRequest}>
          <PlusIcon size={14} /> New request here
        </button>
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
