import { useMemo, useState } from 'react'
import type { HttpMethod } from '@core/types'
import { Logo } from '../Logo'
import {
  ChevronIcon,
  CloseIcon,
  FolderIcon,
  FolderOpenIcon,
  PlusIcon,
  SearchIcon,
  SwapIcon,
  TrashIcon
} from './Icons'

export interface SidebarEntry {
  id: string
  name: string
  method: HttpMethod
  folderPath: string[]
}

export interface SidebarCollection {
  id: string
  name: string
  entries: SidebarEntry[]
}

interface Props {
  collections: SidebarCollection[]
  activeId: string | null
  onSelect: (id: string) => void
  onOpenCollection: () => void
  onImportExport: () => void
  onNewRequest: (collectionId: string) => void
  onCloseCollection: (collectionId: string) => void
  onDeleteRequest: (entryId: string) => void
}

interface TreeFolder {
  name: string
  key: string
  folders: TreeFolder[]
  requests: SidebarEntry[]
}

/**
 * Collapse-state keys are JSON-encoded [collectionId, ...folderSegments]
 * arrays: a collection key has one element, folder keys have more. Plain
 * string concatenation would collide when a collection's subfolder is opened
 * as its own collection (disk ids are absolute paths) or when an imported
 * folder name contains the separator character.
 */
function buildTree(collectionId: string, entries: SidebarEntry[]): TreeFolder {
  const root: TreeFolder = { name: '', key: JSON.stringify([collectionId]), folders: [], requests: [] }
  for (const entry of entries) {
    let node = root
    const segments: string[] = []
    for (const segment of entry.folderPath) {
      segments.push(segment)
      let child = node.folders.find((f) => f.name === segment)
      if (!child) {
        child = {
          name: segment,
          key: JSON.stringify([collectionId, ...segments]),
          folders: [],
          requests: []
        }
        node.folders.push(child)
      }
      node = child
    }
    node.requests.push(entry)
  }
  return root
}

export function Sidebar({
  collections,
  activeId,
  onSelect,
  onOpenCollection,
  onImportExport,
  onNewRequest,
  onCloseCollection,
  onDeleteRequest
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const trees = useMemo(
    () => collections.map((col) => ({ col, tree: buildTree(col.id, col.entries) })),
    [collections]
  )

  const q = query.trim().toLowerCase()

  function renderRequest(entry: SidebarEntry, depth: number) {
    return (
      <div
        key={entry.id}
        className={`tree-row ${entry.id === activeId ? 'active' : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => onSelect(entry.id)}
      >
        <span className={`method-pill m-${entry.method}`}>{entry.method.toUpperCase()}</span>
        <span className="row-label">{entry.name}</span>
        <span className="row-actions">
          <button
            className="icon-btn danger"
            title="Delete request"
            onClick={(e) => {
              e.stopPropagation()
              onDeleteRequest(entry.id)
            }}
          >
            <TrashIcon size={13} />
          </button>
        </span>
      </div>
    )
  }

  function renderFolder(folder: TreeFolder, depth: number) {
    const open = !collapsed.has(folder.key)
    return (
      <div key={folder.key}>
        <div
          className="folder-row"
          style={{ paddingLeft: 8 + depth * 16 }}
          onClick={() => toggle(folder.key)}
        >
          <ChevronIcon size={12} className={`chev ${open ? 'open' : ''}`} />
          <FolderIcon size={14} />
          <span className="row-label">{folder.name}</span>
        </div>
        {open && (
          <>
            {folder.folders.map((f) => renderFolder(f, depth + 1))}
            {folder.requests.map((r) => renderRequest(r, depth + 1.4))}
          </>
        )}
      </div>
    )
  }

  return (
    <aside className="panel sidebar">
      <header>
        <span className="title">Collections</span>
        <button className="icon-btn" title="Open collection folder" onClick={onOpenCollection}>
          <FolderOpenIcon />
        </button>
        <button className="icon-btn" title="Import / Export" onClick={onImportExport}>
          <SwapIcon />
        </button>
      </header>

      <div className="sidebar-search">
        <SearchIcon size={13} />
        <input
          placeholder="Search requests"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />
      </div>

      <div className="tree">
        {collections.length === 0 && (
          <div className="empty" style={{ height: 'auto', padding: '40px 12px' }}>
            <div>No collections open.</div>
            <button className="btn" onClick={onOpenCollection}>
              Open a folder
            </button>
          </div>
        )}

        {q
          ? trees.map(({ col }) => {
              const hits = col.entries.filter((e) => e.name.toLowerCase().includes(q))
              if (!hits.length) return null
              return (
                <div key={col.id}>
                  <div className="col-head" style={{ cursor: 'default' }}>
                    <span className="row-label">{col.name}</span>
                  </div>
                  {hits.map((e) => renderRequest(e, 1))}
                </div>
              )
            })
          : trees.map(({ col, tree }) => {
              const colKey = JSON.stringify([col.id])
              const open = !collapsed.has(colKey)
              return (
                <div key={col.id}>
                  <div className="col-head" onClick={() => toggle(colKey)}>
                    <ChevronIcon size={12} className={`chev ${open ? 'open' : ''}`} />
                    <span className="row-label">{col.name}</span>
                    <span className="row-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="icon-btn"
                        title="New request"
                        onClick={() => onNewRequest(col.id)}
                      >
                        <PlusIcon size={13} />
                      </button>
                      <button
                        className="icon-btn danger"
                        title="Close collection"
                        onClick={() => onCloseCollection(col.id)}
                      >
                        <CloseIcon size={13} />
                      </button>
                    </span>
                  </div>
                  {open && (
                    <>
                      {tree.folders.map((f) => renderFolder(f, 1))}
                      {tree.requests.map((r) => renderRequest(r, 1))}
                    </>
                  )}
                </div>
              )
            })}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '9px 12px',
          borderTop: '1px solid var(--border)',
          color: 'var(--text-dim)',
          fontSize: 11
        }}
      >
        <Logo size={16} /> Tiger · local-first API client
      </div>
    </aside>
  )
}
