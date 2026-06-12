/**
 * Workspace session primitives: the tab model shared by App and the tab bar,
 * and the pure persistence helpers behind "reopen my collections and tabs on
 * launch". Everything here is DOM-free and unit-testable.
 */

/**
 * Separator for composite ids (collection + request path, collection + env
 * name). U+001F never appears in file paths or names, so ids can't collide
 * even when one collection's folder is opened again as its own collection.
 */
export const SEP = '\u001f'

/** A tab in the workspace bar: a request, a collection page, or a folder page. */
export type OpenTab =
  | { kind: 'request'; id: string }
  | { kind: 'collection'; colId: string }
  | { kind: 'folder'; colId: string; path: string[] }

export const tabKey = (t: OpenTab): string =>
  t.kind === 'request'
    ? `r:${t.id}`
    : t.kind === 'collection'
      ? `c:${t.colId}`
      : `f:${t.colId}${SEP}${t.path.join('/')}`

/** localStorage keys for the persisted session. */
export const SESSION_KEYS = {
  roots: 'tiger.session.roots',
  tabs: 'tiger.session.tabs',
  active: 'tiger.session.active'
} as const

/** Parse the persisted list of open collection roots; junk in, empty out. */
export function parseStoredRoots(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((r): r is string => typeof r === 'string' && r.length > 0)
  } catch {
    return []
  }
}

/** Parse persisted tabs, dropping anything that does not match the model. */
export function parseStoredTabs(raw: string | null): OpenTab[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const tabs: OpenTab[] = []
  for (const t of parsed as Array<Record<string, unknown>>) {
    if (!t || typeof t !== 'object') continue
    if (t.kind === 'request' && typeof t.id === 'string' && t.id) {
      tabs.push({ kind: 'request', id: t.id })
    } else if (t.kind === 'collection' && typeof t.colId === 'string' && t.colId) {
      tabs.push({ kind: 'collection', colId: t.colId })
    } else if (
      t.kind === 'folder' &&
      typeof t.colId === 'string' &&
      t.colId &&
      Array.isArray(t.path) &&
      (t.path as unknown[]).every((p) => typeof p === 'string')
    ) {
      tabs.push({ kind: 'folder', colId: t.colId, path: t.path as string[] })
    }
  }
  return tabs
}

export interface OpenedCollectionShape {
  colId: string
  entryIds: Set<string>
  /** folderPath joined with '/' for every entry, for folder-tab resolution. */
  folderKeys: Set<string>
}

/**
 * Keep only the stored tabs that still resolve against what actually opened:
 * a request tab needs its entry, a collection tab its collection, and a folder
 * tab at least one entry whose folder path starts with that folder.
 */
export function resolveStoredTabs(tabs: OpenTab[], opened: OpenedCollectionShape[]): OpenTab[] {
  const byCol = new Map(opened.map((o) => [o.colId, o]))
  const allEntryIds = new Set(opened.flatMap((o) => [...o.entryIds]))
  return tabs.filter((t) => {
    if (t.kind === 'request') return allEntryIds.has(t.id)
    const col = byCol.get(t.colId)
    if (!col) return false
    if (t.kind === 'collection') return true
    const prefix = t.path.join('/')
    return [...col.folderKeys].some((k) => k === prefix || k.startsWith(`${prefix}/`))
  })
}
