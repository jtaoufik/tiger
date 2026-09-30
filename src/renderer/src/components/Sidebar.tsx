import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode
} from 'react'
import type { HttpMethod } from '@core/types'
import { Logo } from '../Logo'
import './Sidebar.css'
import { actionTitle } from '../actions'
import { isContextMenuKey, logicalArrow, menuAnchor } from '../a11y'
import {
  ChevronIcon,
  CloseIcon,
  CopyIcon,
  FolderIcon,
  FolderOpenIcon,
  ChevronDownIcon,
  GitBranchIcon,
  MoreIcon,
  PlusIcon,
  UploadIcon,
  SearchIcon,
  TrashIcon,
  UsersIcon
} from './Icons'
import { summarizeSync, useConflictRoots } from '../gitUx'
import { useT } from '../i18n'
import { emphasize } from '../emphasize'
import type { Translator } from '@core/i18n'
import { SyncBadge } from './TeamSync'

export interface SyncState {
  isRepo: boolean
  dirtyCount: number
  ahead: number
  behind: number
  hasRemote?: boolean
  hasUpstream?: boolean
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
  /** Opens the import half of the Import and export dialog. */
  onImportExport: () => void
  /** Opens the "New" menu (request, folder, collection, environment) at x, y. */
  onNewMenu?: (x: number, y: number) => void
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
  /** Start renaming a request (id) or folder (colId + path); nonce re-triggers. */
  renameTarget?: { id?: string; colId?: string; path?: string[]; nonce: number } | null
}

interface TreeFolder {
  name: string
  key: string
  /** Folder segments below the collection (stable identity for memoized rows). */
  path: string[]
  folders: TreeFolder[]
  requests: SidebarEntry[]
}

/**
 * Above this many requests the search box filters after a short pause instead
 * of on every keystroke, so typing stays fluid in big collections. Small trees
 * keep instant filtering.
 */
export const SEARCH_DEBOUNCE_THRESHOLD = 400
export const SEARCH_DEBOUNCE_MS = 120

/**
 * Trees with more visible rows than this render only the rows near the
 * viewport (plus the focused, tabbable and renaming rows). Skipped siblings
 * collapse into aria-hidden spacers inside their role=group, so the nesting,
 * aria-level, aria-setsize and aria-posinset of every rendered item stay
 * exactly what the full tree would have.
 */
export const WINDOW_MIN_ROWS = 300
/** Rendered beyond each edge of the viewport so a fast scroll never shows a gap. */
const OVERSCAN_PX = 600
/** Row height + gap per kind, until the real ones are measured from the DOM. */
const DEFAULT_STRIDES: Record<FlatNode['kind'], number> = { collection: 44, folder: 32, request: 32 }

/** Smallest i with S[i + 1] > value: the first row whose bottom is below `value`. */
function firstRowEndingAfter(S: Float64Array, value: number): number {
  let lo = 0
  let hi = S.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (S[mid + 1] > value) hi = mid
    else lo = mid + 1
  }
  return lo
}

/** Smallest i with S[i] >= value: the first row starting at or below `value`. */
function firstRowStartingAt(S: Float64Array, value: number): number {
  let lo = 0
  let hi = S.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (S[mid] >= value) hi = mid
    else lo = mid + 1
  }
  return lo
}

/**
 * Collapse-state keys are JSON-encoded [collectionId, ...folderSegments]
 * arrays: a collection key has one element, folder keys have more. Plain
 * string concatenation would collide when a collection's subfolder is opened
 * as its own collection (disk ids are absolute paths) or when an imported
 * folder name contains the separator character.
 */
function buildTree(collectionId: string, entries: SidebarEntry[]): TreeFolder {
  const root: TreeFolder = {
    name: '',
    key: JSON.stringify([collectionId]),
    path: [],
    folders: [],
    requests: []
  }
  // Child lookup by name per folder: a linear scan made this O(requests x folders).
  const index = new Map<TreeFolder, Map<string, TreeFolder>>()
  for (const entry of entries) {
    let node = root
    for (const segment of entry.folderPath) {
      let children = index.get(node)
      if (!children) index.set(node, (children = new Map()))
      let child = children.get(segment)
      if (!child) {
        const path = [...node.path, segment]
        child = {
          name: segment,
          key: JSON.stringify([collectionId, ...path]),
          path,
          folders: [],
          requests: []
        }
        children.set(segment, child)
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
  /** Index just past this row's last visible descendant (row + subtree = [i, end)). */
  end: number
}

/**
 * Everything a memoized row can do. The object handed to rows never changes
 * identity (it reads the latest props through a ref), so a parent re-render,
 * such as a keystroke in the request editor, re-renders no row at all.
 */
interface RowApi {
  select: (id: string) => void
  requestMenu: (id: string, x: number, y: number) => void
  duplicateRequest: (id: string) => void
  deleteRequest: (id: string) => void
  startRenameRequest: (entry: SidebarEntry) => void
  startRenameFolder: (key: string, name: string) => void
  setDraft: (value: string) => void
  commitRename: (entry?: SidebarEntry, folderColId?: string, folderPath?: string[]) => void
  cancelRename: () => void
  toggle: (key: string) => void
  inspectFolder: (colId: string, path: string[]) => void
  folderMenu: (colId: string, path: string[], x: number, y: number) => void
  duplicateFolder: (colId: string, path: string[]) => void
  moveRequest: (entryId: string, colId: string, path: string[]) => void
  setDropKey: (update: (current: string | null) => string | null) => void
  /** Roving tabindex bookkeeping, shared by every treeitem. */
  onItemFocus: (e: FocusEvent<HTMLElement>) => void
}

/** Row buttons are pointer shortcuts; keyboard users get the context menu. */
function rowButton(title: string, icon: ReactNode, onClick: () => void, danger = false) {
  return (
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
}

/** "More actions": the row's context menu, for people who never right-click. */
function moreButton(t: Translator, what: string, open: (x: number, y: number) => void) {
  const label = t('sidebar.row.moreActions', { name: what })
  return (
    <button
      type="button"
      className="icon-btn"
      title={label}
      aria-label={label}
      aria-haspopup="menu"
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation()
        const r = e.currentTarget.getBoundingClientRect()
        open(r.left, r.bottom + 2)
      }}
    >
      <MoreIcon size={13} />
    </button>
  )
}

function chevron(
  t: Translator,
  open: boolean,
  what: 'folder' | 'collection',
  key: string,
  toggle: (key: string) => void
) {
  return (
    <button
      type="button"
      className="icon-btn chev-btn"
      title={t(
        open
          ? what === 'folder'
            ? 'sidebar.row.collapseFolder'
            : 'sidebar.row.collapseCollection'
          : what === 'folder'
            ? 'sidebar.row.expandFolder'
            : 'sidebar.row.expandCollection'
      )}
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
}

interface RequestRowProps {
  entry: SidebarEntry
  colId: string
  depth: number
  level: number
  setsize: number
  posinset: number
  active: boolean
  flash: boolean
  tabbable: boolean
  renaming: boolean
  /** Only meaningful while renaming; '' otherwise, so typing re-renders one row. */
  draft: string
  api: RowApi
}

/** A request leaf of the tree. Memoized: re-renders only when its own props change. */
const RequestRow = memo(function RequestRow({
  entry,
  colId,
  depth,
  level,
  setsize,
  posinset,
  active,
  flash,
  tabbable,
  renaming,
  draft,
  api
}: RequestRowProps) {
  const t = useT()
  const key = reqKey(entry.id)
  const method = entry.method.toUpperCase()
  return (
    <div
      role="treeitem"
      className="tree-node tree-leaf"
      data-node-key={key}
      aria-level={level}
      aria-setsize={setsize}
      aria-posinset={posinset}
      aria-selected={active}
      aria-label={`${method} ${entry.name}`}
      tabIndex={tabbable ? 0 : -1}
      onFocus={api.onItemFocus}
    >
      <div
        className={`tree-row ${active ? 'active' : ''} ${flash ? 'flash' : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        data-entry-id={entry.id}
        draggable={!renaming}
        onDragStart={(e) => {
          e.dataTransfer.setData(
            'application/x-tiger-request',
            JSON.stringify({ id: entry.id, colId })
          )
          e.dataTransfer.effectAllowed = 'move'
        }}
        onClick={() => api.select(entry.id)}
        onContextMenu={(e) => {
          e.preventDefault()
          api.requestMenu(entry.id, e.clientX, e.clientY)
        }}
      >
        <span className={`method-pill m-${entry.method}`} aria-hidden>
          {method}
        </span>
        {renaming ? (
          <input
            className="rename-input"
            aria-label={t('sidebar.row.rename', { name: entry.name })}
            autoFocus
            value={draft}
            spellCheck={false}
            onChange={(e) => api.setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => api.commitRename(entry)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') api.commitRename(entry)
              if (e.key === 'Escape') api.cancelRename()
            }}
          />
        ) : (
          <span
            className="row-label"
            title={t('sidebar.row.renameHint', { name: entry.name })}
            onDoubleClick={(e) => {
              e.stopPropagation()
              api.startRenameRequest(entry)
            }}
          >
            {entry.name}
          </span>
        )}
        <span className="row-actions">
          {rowButton(t('sidebar.row.duplicateRequest'), <CopyIcon size={13} />, () => api.duplicateRequest(entry.id))}
          {rowButton(t('sidebar.row.deleteRequest'), <TrashIcon size={13} />, () => api.deleteRequest(entry.id), true)}
          {moreButton(t, entry.name, (x, y) => api.requestMenu(entry.id, x, y))}
        </span>
      </div>
    </div>
  )
})

interface FolderRowProps {
  folder: TreeFolder
  colId: string
  depth: number
  open: boolean
  selected: boolean
  dropTarget: boolean
  renaming: boolean
  draft: string
  hasMenu: boolean
  api: RowApi
}

/** The visible row of a folder treeitem; the parent renders its child group. */
const FolderRow = memo(function FolderRow({
  folder,
  colId,
  depth,
  open,
  selected,
  dropTarget,
  renaming,
  draft,
  hasMenu,
  api
}: FolderRowProps) {
  const t = useT()
  const path = folder.path
  return (
    <div
      className={`folder-row ${selected ? 'active' : ''} ${dropTarget ? 'drop-target' : ''}`}
      style={{ paddingLeft: 8 + depth * 16 }}
      onClick={() => api.inspectFolder(colId, path)}
      onContextMenu={(e) => {
        if (!hasMenu) return
        e.preventDefault()
        api.folderMenu(colId, path, e.clientX, e.clientY)
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-tiger-request')) {
          e.preventDefault()
          api.setDropKey(() => folder.key)
        }
      }}
      onDragLeave={() => api.setDropKey((k) => (k === folder.key ? null : k))}
      onDrop={(e) => {
        e.preventDefault()
        api.setDropKey(() => null)
        try {
          const payload = JSON.parse(e.dataTransfer.getData('application/x-tiger-request'))
          if (payload.colId === colId) api.moveRequest(payload.id, colId, path)
        } catch {
          /* not ours */
        }
      }}
    >
      {chevron(t, open, 'folder', folder.key, api.toggle)}
      <FolderIcon size={14} />
      {renaming ? (
        <input
          className="rename-input"
          aria-label={t('sidebar.row.renameFolder', { name: folder.name })}
          autoFocus
          value={draft}
          spellCheck={false}
          onChange={(e) => api.setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={() => api.commitRename(undefined, colId, path)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') api.commitRename(undefined, colId, path)
            if (e.key === 'Escape') api.cancelRename()
          }}
        />
      ) : (
        <span
          className="row-label"
          title={t('sidebar.row.renameHint', { name: folder.name })}
          onDoubleClick={(e) => {
            e.stopPropagation()
            api.startRenameFolder(folder.key, folder.name)
          }}
        >
          {folder.name}
        </span>
      )}
      <span className="row-actions">
        {rowButton(t('sidebar.row.duplicateFolder'), <CopyIcon size={13} />, () => api.duplicateFolder(colId, path))}
        {hasMenu && moreButton(t, folder.name, (x, y) => api.folderMenu(colId, path, x, y))}
      </span>
    </div>
  )
})

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
  onEmptyMenu,
  onNewMenu,
  renameTarget
}: Props) {
  const t = useT()
  const conflictRoots = useConflictRoots()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  /** What the search box shows (updates on every keystroke). */
  const [query, setQueryText] = useState('')
  /** What the tree is filtered by; trails `query` briefly in large collections. */
  const [appliedQuery, setAppliedQuery] = useState('')
  const treeRef = useRef<HTMLDivElement>(null)

  const totalEntries = useMemo(
    () => collections.reduce((n, c) => n + c.entries.length, 0),
    [collections]
  )
  const debounceSearch = totalEntries > SEARCH_DEBOUNCE_THRESHOLD
  /** Set the search text; clearing (and small trees) apply immediately. */
  const setQuery = (value: string) => {
    setQueryText(value)
    if (!debounceSearch || !value.trim()) setAppliedQuery(value)
  }
  useEffect(() => {
    if (!debounceSearch || query === appliedQuery) return
    const timer = setTimeout(() => setAppliedQuery(query), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [debounceSearch, query, appliedQuery])
  const effectiveQuery = debounceSearch ? appliedQuery : query

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

  // Rename started from a context menu ("Rename" item) rather than F2.
  useEffect(() => {
    if (!renameTarget) return
    if (renameTarget.id) {
      const entry = collections.flatMap((c) => c.entries).find((x) => x.id === renameTarget.id)
      if (entry) {
        setDraft(entry.name)
        setRenaming({ kind: 'request', id: entry.id })
      }
    } else if (renameTarget.colId && renameTarget.path?.length) {
      const path = renameTarget.path
      setQuery('')
      // Make sure the row exists: expand the collection and every ancestor.
      setCollapsed((prev) => {
        const next = new Set(prev)
        for (let i = 0; i < path.length; i++) {
          next.delete(JSON.stringify([renameTarget.colId, ...path.slice(0, i)]))
        }
        return next
      })
      setDraft(path[path.length - 1])
      setRenaming({ kind: 'folder', key: JSON.stringify([renameTarget.colId, ...path]) })
    }
    // Only a new nonce should restart a rename; collections changing mid-rename must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renameTarget])

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

  // Memoized rows get one api object for their whole life; it forwards to the
  // latest props and closures, so new callback identities from the parent
  // never force 2,000 rows to re-render.
  const latest = useRef({
    onSelect,
    onRequestMenu,
    onDuplicateRequest,
    onDeleteRequest,
    onInspectFolder,
    onFolderMenu,
    onDuplicateFolder,
    onMoveRequest,
    commitRename,
    cancelRename
  })
  latest.current = {
    onSelect,
    onRequestMenu,
    onDuplicateRequest,
    onDeleteRequest,
    onInspectFolder,
    onFolderMenu,
    onDuplicateFolder,
    onMoveRequest,
    commitRename,
    cancelRename
  }
  const api = useMemo<RowApi>(
    () => ({
      select: (id) => latest.current.onSelect(id),
      requestMenu: (id, x, y) => latest.current.onRequestMenu(id, x, y),
      duplicateRequest: (id) => latest.current.onDuplicateRequest(id),
      deleteRequest: (id) => latest.current.onDeleteRequest(id),
      startRenameRequest: (entry) => {
        setDraft(entry.name)
        setRenaming({ kind: 'request', id: entry.id })
      },
      startRenameFolder: (key, name) => {
        setDraft(name)
        setRenaming({ kind: 'folder', key })
      },
      setDraft,
      commitRename: (entry, colId, path) => latest.current.commitRename(entry, colId, path),
      cancelRename: () => latest.current.cancelRename(),
      toggle: (key) =>
        setCollapsed((prev) => {
          const next = new Set(prev)
          if (next.has(key)) next.delete(key)
          else next.add(key)
          return next
        }),
      inspectFolder: (colId, path) => latest.current.onInspectFolder(colId, path),
      folderMenu: (colId, path, x, y) => latest.current.onFolderMenu?.(colId, path, x, y),
      duplicateFolder: (colId, path) => latest.current.onDuplicateFolder(colId, path),
      moveRequest: (id, colId, path) => latest.current.onMoveRequest(id, colId, path),
      setDropKey: (update) => setDropKey(update),
      onItemFocus: (e) => {
        if (e.target === e.currentTarget) setFocusKey(e.currentTarget.dataset.nodeKey ?? null)
      }
    }),
    []
  )

  const trees = useMemo(
    () =>
      collections.map((col) => ({
        col,
        tree: buildTree(col.id, col.entries),
        // Lower-cased once per collection change, not once per keystroke.
        lowerNames: col.entries.map((e) => e.name.toLowerCase())
      })),
    [collections]
  )

  const q = effectiveQuery.trim().toLowerCase()

  const searchHits = useMemo(
    () =>
      q
        ? trees
            .map(({ col, lowerNames }) => ({
              col,
              hits: col.entries.filter((_, i) => lowerNames[i].includes(q))
            }))
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
        entry,
        end: out.length + 1
      })
    if (q) {
      for (const { col, hits } of searchHits) {
        const key = JSON.stringify([col.id])
        const at = out.length
        out.push({ key, kind: 'collection', label: col.name, parent: null, colId: col.id, path: [], expanded: true, end: 0 })
        for (const e of hits) pushRequest(e, key, col.id)
        out[at].end = out.length
      }
      return out
    }
    const walk = (folder: TreeFolder, colId: string) => {
      for (const f of folder.folders) {
        const open = !collapsed.has(f.key)
        const at = out.length
        out.push({
          key: f.key,
          kind: 'folder',
          label: f.name,
          parent: folder.key,
          colId,
          path: f.path,
          expanded: open,
          end: 0
        })
        if (open) walk(f, colId)
        out[at].end = out.length
      }
      for (const r of folder.requests) pushRequest(r, folder.key, colId)
    }
    for (const { col, tree } of trees) {
      const open = !collapsed.has(tree.key)
      const at = out.length
      out.push({ key: tree.key, kind: 'collection', label: col.name, parent: null, colId: col.id, path: [], expanded: open, end: 0 })
      if (open) walk(tree, col.id)
      out[at].end = out.length
    }
    return out
  }, [trees, collapsed, q, searchHits])

  /** Row index by key: keyboard handling and roving tabindex look rows up per event. */
  const flatIndex = useMemo(() => new Map(flat.map((n, i) => [n.key, i])), [flat])

  // The tabbable item: last focused if still visible, else the active request,
  // else the first row. Exactly one item carries tabIndex=0.
  const tabbableKey =
    (focusKey && flatIndex.has(focusKey) && focusKey) ||
    (activeId && flatIndex.has(reqKey(activeId)) && reqKey(activeId)) ||
    flat[0]?.key ||
    null

  // ---- Windowing (large trees only) ----
  const windowed = flat.length > WINDOW_MIN_ROWS
  const [viewport, setViewport] = useState({ top: 0, height: 0 })
  const [strides, setStrides] = useState(DEFAULT_STRIDES)

  /** S[i] = distance from the first row's top to row i's top. */
  const offsets = useMemo(() => {
    if (!windowed) return null
    const S = new Float64Array(flat.length + 1)
    for (let i = 0; i < flat.length; i++) S[i + 1] = S[i] + strides[flat[i].kind]
    return S
  }, [windowed, flat, strides])

  /** Rows [first, last) are near the viewport; `pinned` rows render wherever they are. */
  const renderWindow = useMemo(() => {
    if (!offsets) return null
    const height = viewport.height || window.innerHeight || 800
    const first = firstRowEndingAfter(offsets, viewport.top - OVERSCAN_PX)
    const last = Math.max(first, firstRowStartingAt(offsets, viewport.top + height + OVERSCAN_PX))
    return { first, last }
  }, [offsets, viewport])

  const pinnedKeys = [
    tabbableKey,
    focusKey,
    renaming ? (renaming.kind === 'request' ? reqKey(renaming.id) : renaming.key) : null
  ]
  const pinned = pinnedKeys
    .map((k) => (k ? flatIndex.get(k) : undefined))
    .filter((i): i is number => i !== undefined)

  /** Does the row range [a, b) contain anything that must be in the DOM? */
  const needsRender = (a: number, b: number): boolean =>
    !renderWindow ||
    (a < renderWindow.last && b > renderWindow.first) ||
    pinned.some((p) => p >= a && p < b)

  /** A placeholder with the exact height of the skipped rows [a, b). */
  const spacer = (a: number, b: number) => (
    <div
      key={`spacer:${a}`}
      className="tree-spacer"
      aria-hidden="true"
      style={{ height: offsets ? offsets[b] - offsets[a] : 0 }}
    />
  )

  // Real row heights (font size, zoom and theme all change them).
  useLayoutEffect(() => {
    if (!windowed) return
    const el = treeRef.current
    if (!el) return
    const next = { ...strides }
    const gap = (node: Element | null) =>
      node ? parseFloat(getComputedStyle(node).marginTop) || 0 : 0
    const leaf = el.querySelector('.tree-leaf')
    const leafH = leaf?.getBoundingClientRect().height ?? 0
    if (leafH > 0) next.request = leafH + gap(leaf)
    const folderRow = el.querySelector('.tree-node > .folder-row')
    const folderH = folderRow?.getBoundingClientRect().height ?? 0
    if (folderH > 0) next.folder = folderH + gap(folderRow!.parentElement)
    const head = el.querySelector('.tree-node > .col-head')
    const headH = head?.getBoundingClientRect().height ?? 0
    if (headH > 0) next.collection = headH + gap(head) + gap(head!.parentElement)
    const changed = (Object.keys(next) as FlatNode['kind'][]).some(
      (k) => Math.abs(next[k] - strides[k]) > 0.25
    )
    if (changed) setStrides(next)
  })

  // Track the scroll position and viewport height of the tree.
  const scrollFrame = useRef(0)
  const syncViewport = () => {
    const el = treeRef.current
    if (!el) return
    const top = el.scrollTop
    const height = el.clientHeight
    setViewport((v) => (v.top === top && v.height === height ? v : { top, height }))
  }
  const onTreeScroll = () => {
    if (!windowed || scrollFrame.current) return
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = 0
      syncViewport()
    })
  }
  useLayoutEffect(() => {
    if (!windowed) return
    syncViewport()
    const el = treeRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => syncViewport())
    observer.observe(el)
    return () => observer.disconnect()
  }, [windowed])
  useEffect(() => () => cancelAnimationFrame(scrollFrame.current), [])

  // ArrowDown from the search box while a debounced filter is still pending:
  // apply it first, then land on the first result.
  const focusFirstResult = useRef(false)
  useEffect(() => {
    if (!focusFirstResult.current) return
    focusFirstResult.current = false
    const key = q ? (flat.find((n) => n.kind === 'request')?.key ?? flat[0]?.key) : flat[0]?.key
    if (key) {
      pendingFocus.current = key
      setFocusKey(key)
    }
  })

  useEffect(() => {
    const key = pendingFocus.current
    if (!key) return
    pendingFocus.current = null
    const items = treeRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []
    for (const el of items) {
      if (el.dataset.nodeKey === key) {
        // Scroll the row, not the treeitem: a collection or folder item wraps
        // its whole subtree, taller than the viewport, so "nearest" on it was
        // a no-op and Home from the bottom left its row off screen.
        el.focus({ preventScroll: true })
        ;(el.firstElementChild ?? el).scrollIntoView?.({ block: 'nearest' })
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
    const index = flatIndex.get(target.dataset.nodeKey ?? '') ?? -1
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
    // App shortcuts (Cmd/Ctrl+Enter sends, Cmd/Ctrl+S saves, ...) must reach
    // the window listener: plain Enter here would swallow Cmd/Ctrl+Enter.
    if (e.metaKey || e.ctrlKey) return
    // WAI-ARIA tree: in a right-to-left layout ArrowLeft expands / goes to the
    // first child and ArrowRight collapses / goes to the parent.
    switch (logicalArrow(e.key)) {
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

  /** Common ARIA + roving props for a collection or folder treeitem. */
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
    onFocus: api.onItemFocus
  })

  const inspectedPath = inspected ? inspected.path.join('/') : null

  function renderRequest(
    entry: SidebarEntry,
    depth: number,
    colId: string,
    level: number,
    setsize: number,
    posinset: number
  ) {
    const isRenaming = renaming?.kind === 'request' && renaming.id === entry.id
    return (
      <RequestRow
        key={entry.id}
        entry={entry}
        colId={colId}
        depth={depth}
        level={level}
        setsize={setsize}
        posinset={posinset}
        active={entry.id === activeId}
        flash={entry.id === flashId}
        tabbable={tabbableKey === reqKey(entry.id)}
        renaming={isRenaming}
        draft={isRenaming ? draft : ''}
        api={api}
      />
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
    if (!renderWindow) {
      return (
        <div role="group">
          {folder.folders.map((f, i) => renderFolder(f, depth, colId, level, size, i + 1))}
          {folder.requests.map((r, i) =>
            renderRequest(r, requestDepth, colId, level, size, folder.folders.length + i + 1)
          )}
        </div>
      )
    }
    // Windowed: consecutive children with nothing to show become one spacer.
    const items: ReactNode[] = []
    let skipFrom = -1
    let skipTo = -1
    const flush = () => {
      if (skipFrom >= 0) items.push(spacer(skipFrom, skipTo))
      skipFrom = -1
    }
    const visit = (key: string, render: () => ReactNode) => {
      const i = flatIndex.get(key)
      if (i === undefined) return
      const end = flat[i].end
      if (needsRender(i, end)) {
        flush()
        items.push(render())
      } else {
        if (skipFrom < 0) skipFrom = i
        skipTo = end
      }
    }
    folder.folders.forEach((f, i) =>
      visit(f.key, () => renderFolder(f, depth, colId, level, size, i + 1))
    )
    folder.requests.forEach((r, i) =>
      visit(reqKey(r.id), () =>
        renderRequest(r, requestDepth, colId, level, size, folder.folders.length + i + 1)
      )
    )
    flush()
    return <div role="group">{items}</div>
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
    const selected =
      !!inspected && inspected.colId === colId && inspectedPath === folder.path.join('/')
    const isRenaming = renaming?.kind === 'folder' && renaming.key === folder.key
    return (
      <div key={folder.key} {...itemProps(folder.key, level, setsize, posinset, folder.name, selected, open)}>
        <FolderRow
          folder={folder}
          colId={colId}
          depth={depth}
          open={open}
          selected={selected}
          dropTarget={dropKey === folder.key}
          renaming={isRenaming}
          draft={isRenaming ? draft : ''}
          hasMenu={!!onFolderMenu}
          api={api}
        />
        {open && renderChildren(folder, depth + 1, colId, level + 1)}
      </div>
    )
  }

  /** Search results of one collection, windowed: only rows near the viewport. */
  function renderHits(hits: SidebarEntry[], colId: string) {
    const items: ReactNode[] = []
    let skipFrom = -1
    let skipTo = -1
    hits.forEach((e, n) => {
      const i = flatIndex.get(reqKey(e.id))
      if (i === undefined) return
      if (needsRender(i, i + 1)) {
        if (skipFrom >= 0) items.push(spacer(skipFrom, skipTo))
        skipFrom = -1
        items.push(renderRequest(e, 1, colId, 2, hits.length, n + 1))
      } else {
        if (skipFrom < 0) skipFrom = i
        skipTo = i + 1
      }
    })
    if (skipFrom >= 0) items.push(spacer(skipFrom, skipTo))
    return items
  }

  /** Team sync status for a tracked collection: icon + short text, full sentence on hover. */
  function syncChips(colId: string, root?: string) {
    const sync = syncStates[colId]
    if (!sync?.isRepo) return null
    const summary = summarizeSync(sync, { conflict: !!root && conflictRoots.has(root) })
    const label = t('sidebar.sync.label', { label: summary.label })
    return (
      <button
        type="button"
        className="sync-chips"
        title={t('sidebar.sync.title', { label: summary.label, detail: summary.detail })}
        aria-label={label}
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation()
          onGit(colId)
        }}
      >
        <SyncBadge summary={summary} short />
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
        <h3>{t('sidebar.empty.title')}</h3>
        <p>{t('sidebar.empty.body')}</p>
        <div className="sidebar-empty-actions">
          <button type="button" className="btn accent" onClick={onOpenCollection}>
            {t('sidebar.empty.open')}
          </button>
          <button type="button" className="btn" onClick={onNewCollection}>
            {t('sidebar.empty.new')}
          </button>
        </div>
      </div>
    )
  } else if (q && searchHits.length === 0) {
    tree = (
      <div className="sidebar-empty" role="status">
        <SearchIcon size={22} />
        <p>{emphasize(t('sidebar.search.noMatch', { query: effectiveQuery.trim() }), effectiveQuery.trim())}</p>
        <button type="button" className="btn ghost" onClick={() => setQuery('')}>
          {t('sidebar.search.clear')}
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
            {renderWindow
              ? renderHits(hits, col.id)
              : hits.map((e, i) => renderRequest(e, 1, col.id, 2, hits.length, i + 1))}
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
            {chevron(t, open, 'collection', colKey, api.toggle)}
            <span className="row-label" title={col.root ? `${col.name}\n${col.root}` : col.name}>
              {col.name}
            </span>
            {syncChips(col.id, col.root)}
            <span className="row-actions">
              {col.root && rowButton(actionTitle('team-sync'), <GitBranchIcon size={13} />, () => onGit(col.id))}
              {rowButton(actionTitle('new-request'), <PlusIcon size={13} />, () => onNewRequest(col.id))}
              {rowButton(t('sidebar.row.closeCollection'), <CloseIcon size={13} />, () => onCloseCollection(col.id), true)}
              {moreButton(t, col.name, (x, y) => onCollectionMenu(col.id, x, y))}
            </span>
          </div>
          {open && renderChildren(root, 1, col.id, 2, 1)}
        </div>
      )
    })
  }

  return (
    <nav className="panel sidebar" aria-labelledby="sidebar-title">
      <div className="sidebar-head">
        <h2 className="title" id="sidebar-title">
          {t('sidebar.title')}
        </h2>
        {headerButton(actionTitle('join-team'), <UsersIcon />, onClone)}
      </div>
      <div className="sidebar-actions" role="group" aria-label={t('sidebar.actions.group')}>
        <button
          type="button"
          className="btn ghost sidebar-action"
          title={t('sidebar.actions.newTitle')}
          aria-haspopup="menu"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            if (onNewMenu) onNewMenu(r.left, r.bottom + 4)
            else onNewCollection()
          }}
        >
          <PlusIcon size={14} />
          <span className="sidebar-action-label">{t('sidebar.actions.new')}</span>
          <ChevronDownIcon size={12} />
        </button>
        <button
          type="button"
          className="btn ghost sidebar-action"
          title={actionTitle('open-collection')}
          onClick={onOpenCollection}
        >
          <FolderOpenIcon size={14} />
          <span className="sidebar-action-label">{t('sidebar.actions.open')}</span>
        </button>
        <button
          type="button"
          className="btn ghost sidebar-action"
          title={t('sidebar.actions.importTitle')}
          onClick={onImportExport}
        >
          <UploadIcon size={14} />
          <span className="sidebar-action-label">{t('sidebar.actions.import')}</span>
        </button>
      </div>

      <div className="sidebar-search" role="search">
        <SearchIcon size={13} />
        <input
          type="search"
          aria-label={t('sidebar.search.label')}
          placeholder={t('sidebar.search.label')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && query) {
              e.preventDefault()
              setQuery('')
            } else if (e.key === 'ArrowDown' && query !== effectiveQuery) {
              // A debounced filter is pending: apply it now, then enter the results.
              e.preventDefault()
              focusFirstResult.current = true
              setAppliedQuery(query)
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
        onScroll={onTreeScroll}
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
        <span>{t('sidebar.foot')}</span>
      </div>
    </nav>
  )
}
