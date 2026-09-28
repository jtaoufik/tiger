import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { HttpMethod } from '@core/types'
import { Logo } from '../Logo'
import './Sidebar.css'
import { MOD } from '../platform'
import { isContextMenuKey, menuAnchor } from '../a11y'
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
  onNewCollection: () => void
  onClone: () => void
  onImportExport: () => void
  onNewRequest: (collectionId: string) => void
  onCloseCollection: (collectionId: string) => void
  onDeleteRequest: (entryId: string) => void
  onDuplicateRequest: (entryId: string) => void
  onGit: (collectionId: string) => void
  onRequestMenu: (entryId: string, x: number, y: number) => void
  onCollectionMenu: (collectionId: string, x: number, y: number) => void
  /** Context menu for a folder row (right click, Shift+F10, ContextMenu key). */
  onFolderMenu?: (collectionId: string, path: string[], x: number, y: number) => void
  onInspectCollection: (collectionId: string) => void
  onInspectFolder: (collectionId: string, path: string[]) => void
  onEmptyMenu: (x: number, y: number) => void
  onRenameRequest: (entryId: string, name: string) => void
  onRenameFolder: (collectionId: string, path: string[], name: string) => void
  onDuplicateFolder: (collectionId: string, path: string[]) => void
  onMoveRequest: (entryId: string, collectionId: string, folderPath: string[]) => void
  /** Expand ancestors and flash this request row (nonce re-triggers). */
  reveal?: { id: string; nonce: number } | null
  /** The collection or folder page currently shown (path [] = collection). */
  inspected?: { colId: string; path: string[] } | null
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

/** Tree node key for a request row (collection/folder rows use their JSON key). */
const reqKey = (id: string) => `req:${id}`

/** One visible row of the ARIA tree, in document order. */
interface FlatNode {
  key: string
  kind: 'collection' | 'folder' | 'request'
  label: string
  parent: string | null
  colId: string
  path: string[]
  entry?: SidebarEntry
  /** undefined for leaves. */
  expanded?: boolean
}

export function Sidebar({
  collections,
  activeId,
  onSelect,
  onOpenCollection,
  onNewCollection,
  onClone,
  onImportExport,
  syncStates,
  onNewRequest,
  onCloseCollection,
  onDeleteRequest,
  onDuplicateRequest,
  onGit,
  onRequestMenu,
  onFolderMenu,
  onRenameRequest,
  onRenameFolder,
  onDuplicateFolder,
  onMoveRequest,
  reveal,
  inspected,
  onCollectionMenu,
  onInspectCollection,
  onInspectFolder,
  onEmptyMenu
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const treeRef = useRef<HTMLDivElement>(null)

  // Inline rename: which row is being renamed, and the draft text.
  const [renaming, setRenaming] = useState<
    { kind: 'request'; id: string } | { kind: 'folder'; key: string } | null
  >(null)
  const [draft, setDraft] = useState('')
  // Folder/collection key currently hovered by a request drag.
  const [dropKey, setDropKey] = useState<string | null>(null)

  /** Roving tabindex: the one tree item that is in the Tab order. */
  const [focusKey, setFocusKey] = useState<string | null>(null)
  /** Set when keyboard navigation should move DOM focus after the next render. */
  const pendingFocus = useRef<string | null>(null)
  const typeahead = useRef<{ text: string; at: number }>({ text: '', at: 0 })

  // F2 renames the selected request, like file managers. Inside the tree the
  // focused row owns F2 (handled below), so skip events it already consumed.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'F2' || e.defaultPrevented || !activeId || renaming) return
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
    setFocusKey(reqKey(reveal.id))
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
    // Keyboard users keep their place: focus returns to the renamed row.
    pendingFocus.current = focusKey
    setRenaming(null)
  }
  const cancelRename = () => {
    pendingFocus.current = focusKey
    setRenaming(null)
  }

  const setOpen = (key: string, open: boolean) =>
    setCollapsed((prev) => {
      if (open === !prev.has(key)) return prev
      const next = new Set(prev)
      if (open) next.delete(key)
      else next.add(key)
      return next
    })
  const toggle = (key: string) => setOpen(key, collapsed.has(key))

  const trees = useMemo(
    () => collections.map((col) => ({ col, tree: buildTree(col.id, col.entries) })),
    [collections]
  )

  const q = query.trim().toLowerCase()

  const searchHits = useMemo(
    () =>
      q
        ? trees
            .map(({ col }) => ({ col, hits: col.entries.filter((e) => e.name.toLowerCase().includes(q)) }))
            .filter((x) => x.hits.length > 0)
        : [],
    [trees, q]
  )

  /** Every visible tree item in document order: the keyboard model. */
  const flat = useMemo(() => {
    const out: FlatNode[] = []
    const pushRequest = (entry: SidebarEntry, parent: string, colId: string) =>
      out.push({
        key: reqKey(entry.id),
        kind: 'request',
        label: entry.name,
        parent,
        colId,
        path: entry.folderPath,
        entry
      })
    if (q) {
      for (const { col, hits } of searchHits) {
        const key = JSON.stringify([col.id])
        out.push({ key, kind: 'collection', label: col.name, parent: null, colId: col.id, path: [], expanded: true })
        for (const e of hits) pushRequest(e, key, col.id)
      }
      return out
    }
    const walk = (folder: TreeFolder, colId: string) => {
      for (const f of folder.folders) {
        const open = !collapsed.has(f.key)
        out.push({
          key: f.key,
          kind: 'folder',
          label: f.name,
          parent: folder.key,
          colId,
          path: (JSON.parse(f.key) as string[]).slice(1),
          expanded: open
        })
        if (open) walk(f, colId)
      }
      for (const r of folder.requests) pushRequest(r, folder.key, colId)
    }
    for (const { col, tree } of trees) {
      const open = !collapsed.has(tree.key)
      out.push({ key: tree.key, kind: 'collection', label: col.name, parent: null, colId: col.id, path: [], expanded: open })
      if (open) walk(tree, col.id)
    }
    return out
  }, [trees, collapsed, q, searchHits])

  // The tabbable item: last focused if still visible, else the active request,
  // else the first row. Exactly one item carries tabIndex=0.
  const tabbableKey =
    (focusKey && flat.some((n) => n.key === focusKey) && focusKey) ||
    (activeId && flat.some((n) => n.key === reqKey(activeId)) && reqKey(activeId)) ||
    flat[0]?.key ||
    null

  useEffect(() => {
    const key = pendingFocus.current
    if (!key) return
    pendingFocus.current = null
    const items = treeRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []
    for (const el of items) {
      if (el.dataset.nodeKey === key) {
        el.focus()
        el.scrollIntoView?.({ block: 'nearest' })
        break
      }
    }
  })

  const moveTo = (key: string | undefined) => {
    if (!key) return
    pendingFocus.current = key
    setFocusKey(key)
  }

  const activate = (node: FlatNode) => {
    if (node.kind === 'request' && node.entry) onSelect(node.entry.id)
    else if (node.kind === 'folder') onInspectFolder(node.colId, node.path)
    else onInspectCollection(node.colId)
  }

  const openMenuFor = (node: FlatNode, el: Element) => {
    const { x, y } = menuAnchor(el.firstElementChild ?? el)
    if (node.kind === 'request' && node.entry) onRequestMenu(node.entry.id, x, y)
    else if (node.kind === 'folder') onFolderMenu?.(node.colId, node.path, x, y)
    else onCollectionMenu(node.colId, x, y)
  }

  const onTreeKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.getAttribute('role') !== 'treeitem') return
    const index = flat.findIndex((n) => n.key === target.dataset.nodeKey)
    const node = flat[index]
    if (!node) return
    const handled = () => {
      e.preventDefault()
      e.stopPropagation()
    }
    if (isContextMenuKey(e)) {
      handled()
      openMenuFor(node, target)
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        handled()
        moveTo(flat[index + 1]?.key)
        return
      case 'ArrowUp':
        handled()
        moveTo(flat[index - 1]?.key)
        return
      case 'Home':
        handled()
        moveTo(flat[0]?.key)
        return
      case 'End':
        handled()
        moveTo(flat[flat.length - 1]?.key)
        return
      case 'ArrowRight':
        handled()
        if (node.expanded === false) setOpen(node.key, true)
        else if (node.expanded && flat[index + 1]?.parent === node.key) moveTo(flat[index + 1].key)
        return
      case 'ArrowLeft':
        handled()
        if (node.expanded && !q) setOpen(node.key, false)
        else if (node.parent) moveTo(node.parent)
        return
      case 'Enter':
      case ' ':
        handled()
        activate(node)
        return
      case 'F2':
        if (node.kind === 'request' && node.entry) {
          handled()
          setDraft(node.entry.name)
          setRenaming({ kind: 'request', id: node.entry.id })
        } else if (node.kind === 'folder') {
          handled()
          setDraft(node.label)
          setRenaming({ kind: 'folder', key: node.key })
        }
        return
      case 'Delete':
        if (node.kind === 'request' && node.entry) {
          handled()
          onDeleteRequest(node.entry.id)
        }
        return
    }
    // Type-ahead: printable characters jump to the next row starting with them.
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ') {
      const now = Date.now()
      const ta = typeahead.current
      ta.text = now - ta.at > 700 ? e.key.toLowerCase() : ta.text + e.key.toLowerCase()
      ta.at = now
      const order = [...flat.slice(index + 1), ...flat.slice(0, index + 1)]
      const hit =
        order.find((n) => n.label.toLowerCase().startsWith(ta.text)) ??
        (ta.text.length > 1 ? undefined : order.find((n) => n.label.toLowerCase().startsWith(e.key.toLowerCase())))
      if (hit) {
        handled()
        moveTo(hit.key)
      }
    }
  }

  /** Common ARIA + roving props for a tree item. */
  const itemProps = (
    key: string,
    level: number,
    setsize: number,
    posinset: number,
    label: string,
    selected: boolean,
    expanded?: boolean
  ) => ({
    role: 'treeitem' as const,
    className: 'tree-node',
    'data-node-key': key,
    'aria-level': level,
    'aria-setsize': setsize,
    'aria-posinset': posinset,
    'aria-selected': selected,
    'aria-expanded': expanded,
    'aria-label': label,
    tabIndex: tabbableKey === key ? 0 : -1,
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      if (e.target === e.currentTarget) setFocusKey(key)
    }
  })

  /** Row buttons are pointer shortcuts; keyboard users get the context menu. */
  const rowButton = (
    title: string,
    icon: ReactNode,
    onClick: () => void,
    danger = false
  ) => (
    <button
      type="button"
      className={`icon-btn${danger ? ' danger' : ''}`}
      title={title}
      aria-label={title}
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      {icon}
    </button>
  )

  const chevron = (open: boolean, what: 'folder' | 'collection', key: string) => (
    <button
      type="button"
      className="icon-btn chev-btn"
      title={open ? `Collapse ${what}` : `Expand ${what}`}
      aria-hidden
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation()
        toggle(key)
      }}
    >
      <ChevronIcon size={12} className={`chev ${open ? 'open' : ''}`} />
    </button>
  )

  function renderRequest(
    entry: SidebarEntry,
    depth: number,
    colId: string,
    level: number,
    setsize: number,
    posinset: number
  ) {
    const isRenaming = renaming?.kind === 'request' && renaming.id === entry.id
    const key = reqKey(entry.id)
    const method = entry.method.toUpperCase()
    const active = entry.id === activeId
    return (
      <div key={entry.id} {...itemProps(key, level, setsize, posinset, `${method} ${entry.name}`, active)}>
        <div
          className={`tree-row ${active ? 'active' : ''} ${entry.id === flashId ? 'flash' : ''}`}
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
          <span className={`method-pill m-${entry.method}`} aria-hidden>
            {method}
          </span>
          {isRenaming ? (
            <input
              className="rename-input"
              aria-label={`Rename ${entry.name}`}
              autoFocus
              value={draft}
              spellCheck={false}
              onChange={(e) => setDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => commitRename(entry)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') commitRename(entry)
                if (e.key === 'Escape') cancelRename()
              }}
            />
          ) : (
            <span
              className="row-label"
              title={`${entry.name}\nDouble-click to rename (F2)`}
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
            {rowButton('Duplicate request', <CopyIcon size={13} />, () => onDuplicateRequest(entry.id))}
            {rowButton('Delete request', <TrashIcon size={13} />, () => onDeleteRequest(entry.id), true)}
          </span>
        </div>
      </div>
    )
  }

  /** Children of a collection or folder, with sibling position info. */
  function renderChildren(
    folder: TreeFolder,
    depth: number,
    colId: string,
    level: number,
    requestDepth = depth + 0.4
  ) {
    const size = folder.folders.length + folder.requests.length
    return (
      <div role="group">
        {folder.folders.map((f, i) => renderFolder(f, depth, colId, level, size, i + 1))}
        {folder.requests.map((r, i) =>
          renderRequest(r, requestDepth, colId, level, size, folder.folders.length + i + 1)
        )}
      </div>
    )
  }

  function renderFolder(
    folder: TreeFolder,
    depth: number,
    colId: string,
    level: number,
    setsize: number,
    posinset: number
  ) {
    const open = !collapsed.has(folder.key)
    const path = (JSON.parse(folder.key) as string[]).slice(1)
    const selected =
      !!inspected && inspected.colId === colId && inspected.path.join('/') === path.join('/')
    return (
      <div key={folder.key} {...itemProps(folder.key, level, setsize, posinset, folder.name, selected, open)}>
        <div
          className={`folder-row ${selected ? 'active' : ''} ${dropKey === folder.key ? 'drop-target' : ''}`}
          style={{ paddingLeft: 8 + depth * 16 }}
          onClick={() => onInspectFolder(colId, path)}
          onContextMenu={(e) => {
            if (!onFolderMenu) return
            e.preventDefault()
            onFolderMenu(colId, path, e.clientX, e.clientY)
          }}
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
          {chevron(open, 'folder', folder.key)}
          <FolderIcon size={14} />
          {renaming?.kind === 'folder' && renaming.key === folder.key ? (
            <input
              className="rename-input"
              aria-label={`Rename folder ${folder.name}`}
              autoFocus
              value={draft}
              spellCheck={false}
              onChange={(e) => setDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => commitRename(undefined, colId, path)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') commitRename(undefined, colId, path)
                if (e.key === 'Escape') cancelRename()
              }}
            />
          ) : (
            <span
              className="row-label"
              title={`${folder.name}\nDouble-click to rename (F2)`}
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
            {rowButton('Duplicate folder', <CopyIcon size={13} />, () => onDuplicateFolder(colId, path))}
          </span>
        </div>
        {open && renderChildren(folder, depth + 1, colId, level + 1)}
      </div>
    )
  }

  function syncChips(colId: string) {
    const sync = syncStates[colId]
    if (!sync?.isRepo) return null
    const clean = sync.dirtyCount === 0 && sync.ahead === 0 && sync.behind === 0
    const parts = [
      sync.dirtyCount > 0 && `${sync.dirtyCount} change(s) not yet shared`,
      sync.ahead > 0 && `${sync.ahead} update(s) ready to share`,
      sync.behind > 0 && `${sync.behind} team update(s) to fetch`,
      clean && 'In sync with your team'
    ].filter(Boolean)
    const label = `Team sync: ${parts.join(', ')}`
    return (
      <button
        type="button"
        className="sync-chips"
        title={`${label}. Click to open.`}
        aria-label={label}
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation()
          onGit(colId)
        }}
      >
        {sync.dirtyCount > 0 && <span className="git-chip dirty">{sync.dirtyCount}</span>}
        {sync.ahead > 0 && (
          <span className="git-chip ahead">
            <ArrowUpIcon size={10} />
            {sync.ahead}
          </span>
        )}
        {sync.behind > 0 && (
          <span className="git-chip behind">
            <ArrowDownIcon size={10} />
            {sync.behind}
          </span>
        )}
        {clean && (
          <span className="git-chip synced">
            <CheckIcon size={10} />
          </span>
        )}
      </button>
    )
  }

  const headerButton = (title: string, icon: ReactNode, onClick: () => void) => (
    <button type="button" className="icon-btn" title={title} aria-label={title} onClick={onClick}>
      {icon}
    </button>
  )

  let tree: ReactNode
  if (collections.length === 0) {
    tree = (
      <div className="sidebar-empty">
        <FolderOpenIcon size={26} />
        <h3>No collections open.</h3>
        <p>Open a folder of .tiger files, or start a new collection.</p>
        <div className="sidebar-empty-actions">
          <button type="button" className="btn accent" onClick={onOpenCollection}>
            Open a folder
          </button>
          <button type="button" className="btn" onClick={onNewCollection}>
            New collection
          </button>
        </div>
      </div>
    )
  } else if (q && searchHits.length === 0) {
    tree = (
      <div className="sidebar-empty" role="status">
        <SearchIcon size={22} />
        <p>
          No requests match <b>{query.trim()}</b>.
        </p>
        <button type="button" className="btn ghost" onClick={() => setQuery('')}>
          Clear search
        </button>
      </div>
    )
  } else if (q) {
    tree = searchHits.map(({ col, hits }, ci) => {
      const key = JSON.stringify([col.id])
      return (
        <div key={col.id} {...itemProps(key, 1, searchHits.length, ci + 1, col.name, false, true)}>
          <div className="col-head search-head">
            <span className="row-label" title={col.name}>
              {col.name}
            </span>
            <span className="col-count" aria-hidden>
              {hits.length}
            </span>
          </div>
          <div role="group">
            {hits.map((e, i) => renderRequest(e, 1, col.id, 2, hits.length, i + 1))}
          </div>
        </div>
      )
    })
  } else {
    tree = trees.map(({ col, tree: root }, ci) => {
      const colKey = root.key
      const open = !collapsed.has(colKey)
      const selected = !!inspected && inspected.colId === col.id && inspected.path.length === 0
      return (
        <div key={col.id} {...itemProps(colKey, 1, trees.length, ci + 1, col.name, selected, open)}>
          <div
            className={`col-head ${selected ? 'active' : ''} ${dropKey === colKey ? 'drop-target' : ''}`}
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
                const payload = JSON.parse(e.dataTransfer.getData('application/x-tiger-request'))
                if (payload.colId === col.id) onMoveRequest(payload.id, col.id, [])
              } catch {
                /* not ours */
              }
            }}
          >
            {chevron(open, 'collection', colKey)}
            <span className="row-label" title={col.root ? `${col.name}\n${col.root}` : col.name}>
              {col.name}
            </span>
            {syncChips(col.id)}
            <span className="row-actions">
              {col.root && rowButton('Team sync', <GitBranchIcon size={13} />, () => onGit(col.id))}
              {rowButton(`New request (${MOD}+T)`, <PlusIcon size={13} />, () => onNewRequest(col.id))}
              {rowButton('Close collection', <CloseIcon size={13} />, () => onCloseCollection(col.id), true)}
            </span>
          </div>
          {open && renderChildren(root, 1, col.id, 2, 1)}
        </div>
      )
    })
  }

  return (
    <nav className="panel sidebar" aria-labelledby="sidebar-title">
      <header>
        <h2 className="title" id="sidebar-title">
          Collections
        </h2>
        {headerButton('Open collection folder', <FolderOpenIcon />, onOpenCollection)}
        {headerButton('New collection', <PlusIcon size={15} />, onNewCollection)}
        {headerButton('Clone from Git', <GitBranchIcon />, onClone)}
        {headerButton('Import / Export', <SwapIcon />, onImportExport)}
      </header>

      <div className="sidebar-search" role="search">
        <SearchIcon size={13} />
        <input
          type="search"
          aria-label="Search requests"
          placeholder="Search requests"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && query) {
              e.preventDefault()
              setQuery('')
            } else if (e.key === 'ArrowDown' && flat.length) {
              e.preventDefault()
              moveTo(q ? (flat.find((n) => n.kind === 'request')?.key ?? flat[0].key) : flat[0].key)
            }
          }}
          spellCheck={false}
        />
      </div>

      <div
        className="tree"
        ref={treeRef}
        role={flat.length ? 'tree' : undefined}
        aria-labelledby={flat.length ? 'sidebar-title' : undefined}
        onKeyDown={onTreeKeyDown}
        onContextMenu={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault()
            onEmptyMenu(e.clientX, e.clientY)
          }
        }}
      >
        {tree}
      </div>

      <div className="sidebar-foot">
        <span aria-hidden>
          <Logo size={16} />
        </span>
        <span>Tiger · local-first API client</span>
      </div>
    </nav>
  )
}
