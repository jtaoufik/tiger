import { useEffect, useMemo, useState } from 'react'
import type { HttpMethod } from '@core/types'
import { Logo } from '../Logo'
import './Sidebar.css'
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
  onRenameRequest: (entryId: string, name: string) => void
  onRenameFolder: (collectionId: string, path: string[], name: string) => void
  onDuplicateFolder: (collectionId: string, path: string[]) => void
  onMoveRequest: (entryId: string, collectionId: string, folderPath: string[]) => void
  /** Expand ancestors and flash this request row (nonce re-triggers). */
  reveal?: { id: string; nonce: number } | null
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
  onRenameRequest,
  onRenameFolder,
  onDuplicateFolder,
  onMoveRequest,
  reveal,
  onCollectionMenu,
  onInspectCollection,
  onInspectFolder,
  onEmptyMenu
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')

  // Inline rename: which row is being renamed, and the draft text.
  const [renaming, setRenaming] = useState<
    { kind: 'request'; id: string } | { kind: 'folder'; key: string } | null
  >(null)
  const [draft, setDraft] = useState('')
  // Folder/collection key currently hovered by a request drag.
  const [dropKey, setDropKey] = useState<string | null>(null)

  // F2 renames the selected request, like file managers.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F2' || !activeId || renaming) return
      const entry = collections.flatMap((c) => c.entries).find((x) => x.id === activeId)
      if (entry) {
        e.preventDefault()
        setDraft(entry.name)
        setRenaming({ kind: 'request', id: entry.id })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeId, renaming, collections])

  const [flashId, setFlashId] = useState<string | null>(null)

  // Reveal: clear search, expand the collection + ancestor folders, flash + scroll.
  useEffect(() => {
    if (!reveal) return
    const col = collections.find((c) => c.entries.some((e) => e.id === reveal.id))
    const entry = col?.entries.find((e) => e.id === reveal.id)
    if (!col || !entry) return
    setQuery('')
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.delete(JSON.stringify([col.id]))
      for (let i = 1; i <= entry.folderPath.length; i++) {
        next.delete(JSON.stringify([col.id, ...entry.folderPath.slice(0, i)]))
      }
      return next
    })
    setFlashId(reveal.id)
    const timer = setTimeout(() => setFlashId(null), 1300)
    setTimeout(() => {
      // Ids contain U+001F, so locate by dataset rather than a CSS selector.
      const rows = document.querySelectorAll<HTMLElement>('.tree-row[data-entry-id]')
      for (const row of rows) {
        if (row.dataset.entryId === reveal.id) {
          row.scrollIntoView?.({ block: 'nearest' })
          break
        }
      }
    }, 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal?.nonce])

  const commitRename = (entry?: SidebarEntry, folderColId?: string, folderPath?: string[]) => {
    if (!renaming) return
    if (renaming.kind === 'request' && entry) onRenameRequest(entry.id, draft)
    if (renaming.kind === 'folder' && folderColId && folderPath) {
      onRenameFolder(folderColId, folderPath, draft)
    }
    setRenaming(null)
  }

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

  function renderRequest(entry: SidebarEntry, depth: number, colId: string) {
    const isRenaming = renaming?.kind === 'request' && renaming.id === entry.id
    return (
      <div
        key={entry.id}
        className={`tree-row ${entry.id === activeId ? 'active' : ''} ${entry.id === flashId ? 'flash' : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        data-entry-id={entry.id}
        draggable={!isRenaming}
        onDragStart={(e) => {
          e.dataTransfer.setData(
            'application/x-tiger-request',
            JSON.stringify({ id: entry.id, colId })
          )
          e.dataTransfer.effectAllowed = 'move'
        }}
        onClick={() => onSelect(entry.id)}
        onContextMenu={(e) => {
          e.preventDefault()
          onRequestMenu(entry.id, e.clientX, e.clientY)
        }}
      >
        <span className={`method-pill m-${entry.method}`}>{entry.method.toUpperCase()}</span>
        {isRenaming ? (
          <input
            className="rename-input"
            autoFocus
            value={draft}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => commitRename(entry)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename(entry)
              if (e.key === 'Escape') setRenaming(null)
            }}
          />
        ) : (
          <span
            className="row-label"
            title="Double-click to rename (F2)"
            onDoubleClick={(e) => {
              e.stopPropagation()
              setDraft(entry.name)
              setRenaming({ kind: 'request', id: entry.id })
            }}
          >
            {entry.name}
          </span>
        )}
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
          className={`folder-row ${dropKey === folder.key ? 'drop-target' : ''}`}
          style={{ paddingLeft: 8 + depth * 16 }}
          onClick={() => onInspectFolder(colId, path)}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('application/x-tiger-request')) {
              e.preventDefault()
              setDropKey(folder.key)
            }
          }}
          onDragLeave={() => setDropKey((k) => (k === folder.key ? null : k))}
          onDrop={(e) => {
            e.preventDefault()
            setDropKey(null)
            try {
              const payload = JSON.parse(e.dataTransfer.getData('application/x-tiger-request'))
              if (payload.colId === colId) onMoveRequest(payload.id, colId, path)
            } catch {
              /* not ours */
            }
          }}
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
          {renaming?.kind === 'folder' && renaming.key === folder.key ? (
            <input
              className="rename-input"
              autoFocus
              value={draft}
              spellCheck={false}
              onChange={(e) => setDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => commitRename(undefined, colId, path)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename(undefined, colId, path)
                if (e.key === 'Escape') setRenaming(null)
              }}
            />
          ) : (
            <span
              className="row-label"
              title="Double-click to rename"
              onDoubleClick={(e) => {
                e.stopPropagation()
                setDraft(folder.name)
                setRenaming({ kind: 'folder', key: folder.key })
              }}
            >
              {folder.name}
            </span>
          )}
          <span className="row-actions">
            <button
              className="icon-btn"
              title="Duplicate folder"
              onClick={(e) => {
                e.stopPropagation()
                onDuplicateFolder(colId, path)
              }}
            >
              <CopyIcon size={13} />
            </button>
          </span>
        </div>
        {open && (
          <>
            {folder.folders.map((f) => renderFolder(f, depth + 1, colId))}
            {folder.requests.map((r) => renderRequest(r, depth + 1.4, colId))}
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
                  {hits.map((e) => renderRequest(e, 1, col.id))}
                </div>
              )
            })
          : trees.map(({ col, tree }) => {
              const colKey = JSON.stringify([col.id])
              const open = !collapsed.has(colKey)
              return (
                <div key={col.id}>
                  <div
                    className={`col-head ${dropKey === colKey ? 'drop-target' : ''}`}
                    onClick={() => onInspectCollection(col.id)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      onCollectionMenu(col.id, e.clientX, e.clientY)
                    }}
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes('application/x-tiger-request')) {
                        e.preventDefault()
                        setDropKey(colKey)
                      }
                    }}
                    onDragLeave={() => setDropKey((k) => (k === colKey ? null : k))}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDropKey(null)
                      try {
                        const payload = JSON.parse(
                          e.dataTransfer.getData('application/x-tiger-request')
                        )
                        if (payload.colId === col.id) onMoveRequest(payload.id, col.id, [])
                      } catch {
                        /* not ours */
                      }
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
                        title="New request (Cmd/Ctrl+T)"
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
                      {tree.requests.map((r) => renderRequest(r, 1, col.id))}
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
