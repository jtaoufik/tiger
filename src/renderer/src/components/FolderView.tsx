import { useEffect, useState } from 'react'
import { parseCollectionSettings, serializeCollectionSettings } from '@core/collectionSettings'
import type { SidebarEntry } from './Sidebar'
import { FolderIcon, PlusIcon } from './Icons'

interface Props {
  collectionName: string
  /** Absolute collection root, when on disk; enables folder.tiger docs. */
  root?: string
  path: string[]
  entries: SidebarEntry[]
  onSelect: (id: string) => void
  onNewRequest: () => void
  onToast: (text: string) => void
}

/** Full-page view for a folder: docs, its requests, plus new-request-here. */
export function FolderView({
  collectionName,
  root,
  path,
  entries,
  onSelect,
  onNewRequest,
  onToast
}: Props) {
  const folderFile = root ? `${root}/${path.join('/')}/folder.tiger` : null
  const [docs, setDocs] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    if (!folderFile || !window.tiger) {
      setDocs('')
      setLoaded(true)
      return
    }
    window.tiger
      .readFile(folderFile)
      .then((text) => {
        if (!cancelled) setDocs(parseCollectionSettings(text).docs ?? '')
      })
      .catch(() => {
        if (!cancelled) setDocs('')
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [folderFile])

  const saveDocs = (next: string) => {
    if (!folderFile || !window.tiger) return
    if (next.trim()) {
      window.tiger.writeFile(folderFile, serializeCollectionSettings({ docs: next }))
      onToast('Folder docs saved')
    }
  }

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

      {folderFile && loaded && (
        <>
          <div className="section-label">Documentation</div>
          <div className="cv-card">
            <textarea
              className="docs-area"
              placeholder="Document this folder in Markdown…"
              defaultValue={docs}
              key={folderFile + (loaded ? '1' : '0')}
              spellCheck={false}
              onBlur={(e) => {
                if (e.target.value !== docs) saveDocs(e.target.value)
              }}
            />
          </div>
        </>
      )}

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
