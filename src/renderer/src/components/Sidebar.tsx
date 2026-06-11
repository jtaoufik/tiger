import { useMemo, useState } from 'react'
import type { HttpMethod } from '@core/types'
import { Logo } from '../Logo'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronIcon,
  CloseIcon,
  CopyIcon,
  FolderIcon,
  FolderOpenIcon,
  GitBranchIcon,
  PlusIcon,
  SearchIcon,
  SwapIcon,
  TrashIcon
} from './Icons'

export interface SyncState {
  isRepo: boolean
  dirtyCount: number
  ahead: number
  behind: number
}

export interface SidebarEntry {
  id: string
  name: string
  method: HttpMethod
  folderPath: string[]
}

export interface SidebarCollection {
  id: string
  name: string
  root?: string
  entries: SidebarEntry[]
}

interface Props {
  collections: SidebarCollection[]
  activeId: string | null
  syncStates: Record<string, SyncState>
  onSelect: (id: string) => void
  onOpenCollection: () => void
  onClone: () => void
  onImportExport: () => void
  onNewRequest: (collectionId: string) => void
  onCloseCollection: (collectionId: string) => void
  onDeleteRequest: (entryId: string) => void
  onDuplicateRequest: (entryId: string) => void
  onGit: (collectionId: string) => void
  onRequestMenu: (entryId: string, x: number, y: number) => void
  onCollectionMenu: (collectionId: string, x: number, y: number) => void
  onInspectCollection: (collectionId: string) => void
  onInspectFolder: (collectionId: string, path: string[]) => void
  onEmptyMenu: (x: number, y: number) => void
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
  onClone,
  onImportExport,
  syncStates,
  onNewRequest,
  onCloseCollection,
  onDeleteRequest,
  onDuplicateRequest,
  onGit,
  onRequestMenu,
  onCollectionMenu,
  onInspectCollection,
  onInspectFolder,
  onEmptyMenu
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
        onContextMenu={(e) => {
          e.preventDefault()
          onRequestMenu(entry.id, e.clientX, e.clientY)
        }}
      >
        <span className={`method-pill m-${entry.method}`}>{entry.method.toUpperCase()}</span>
        <span className="row-label">{entry.name}</span>
        <span className="row-actions">
          <button
            className="icon-btn"
            title="Duplicate request"
            onClick={(e) => {
              e.stopPropagation()
              onDuplicateRequest(entry.id)
            }}
          >
            <CopyIcon size={13} />
          </button>
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

  function renderFolder(folder: TreeFolder, depth: number, colId: string) {
    const open = !collapsed.has(folder.key)
    const path = (JSON.parse(folder.key) as string[]).slice(1)
    return (
      <div key={folder.key}>
        <div
          className="folder-row"
          style={{ paddingLeft: 8 + depth * 16 }}
          onClick={() => onInspectFolder(colId, path)}
        >
          <button
            className="icon-btn chev-btn"
            title={open ? 'Collapse folder' : 'Expand folder'}
            onClick={(e) => {
              e.stopPropagation()
              toggle(folder.key)
            }}
          >
            <ChevronIcon size={12} className={`chev ${open ? 'open' : ''}`} />
          </button>
          <FolderIcon size={14} />
          <span className="row-label">{folder.name}</span>
        </div>
        {open && (
          <>
            {folder.folders.map((f) => renderFolder(f, depth + 1, colId))}
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
        <button className="icon-btn" title="Clone from Git" onClick={onClone}>
          <GitBranchIcon />
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

      <div
        className="tree"
        onContextMenu={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault()
            onEmptyMenu(e.clientX, e.clientY)
          }
        }}
      >
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
                  <div
                    className="col-head"
                    onClick={() => onInspectCollection(col.id)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      onCollectionMenu(col.id, e.clientX, e.clientY)
                    }}
                  >
                    <button
                      className="icon-btn chev-btn"
                      title={open ? 'Collapse collection' : 'Expand collection'}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggle(colKey)
                      }}
                    >
                      <ChevronIcon size={12} className={`chev ${open ? 'open' : ''}`} />
                    </button>
                    <span className="row-label">{col.name}</span>
                    {(() => {
                      const sync = syncStates[col.id]
                      if (!sync?.isRepo) return null
                      const clean = sync.dirtyCount === 0 && sync.ahead === 0 && sync.behind === 0
                      return (
                        <span
                          className="sync-chips"
                          title="Git status — click to open"
                          onClick={(e) => {
                            e.stopPropagation()
                            onGit(col.id)
                          }}
                        >
                          {sync.dirtyCount > 0 && (
                            <span className="git-chip dirty" title={`${sync.dirtyCount} uncommitted change(s)`}>
                              {sync.dirtyCount}
                            </span>
                          )}
                          {sync.ahead > 0 && (
                            <span className="git-chip ahead" title={`${sync.ahead} commit(s) to push`}>
                              <ArrowUpIcon size={10} />
                              {sync.ahead}
                            </span>
                          )}
                          {sync.behind > 0 && (
                            <span className="git-chip behind" title={`${sync.behind} commit(s) to pull`}>
                              <ArrowDownIcon size={10} />
                              {sync.behind}
                            </span>
                          )}
                          {clean && (
                            <span className="git-chip synced" title="Synced with remote">
                              <CheckIcon size={10} />
                            </span>
                          )}
                        </span>
                      )
                    })()}
                    <span className="row-actions" onClick={(e) => e.stopPropagation()}>
                      {col.root && (
                        <button className="icon-btn" title="Git" onClick={() => onGit(col.id)}>
                          <GitBranchIcon size={13} />
                        </button>
                      )}
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
                      {tree.folders.map((f) => renderFolder(f, 1, col.id))}
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
