import { readdir } from 'node:fs/promises'
import { readTextFile } from './textFile'
import { basename, join, relative, sep } from 'node:path'
import { parseRequest } from '../core/tigerFormat'
import { parseCollectionSettings, type CollectionSettings } from '../core/collectionSettings'
import { parseEnvironment } from '../core/environment'
import type { HttpMethod, TigerAuth } from '../core/types'

export interface RequestEntry {
  name: string
  method: HttpMethod
  /** WebSocket or SSE requests; absent for HTTP. */
  kind?: 'ws' | 'sse'
  /** Position within its folder (`meta { seq }`), when the file has one. */
  seq?: number
  path: string
  /** Folder names from the collection root down to (but not including) the file. */
  folder: string[]
}

/** A folder's own settings, from its `folder.tiger`. */
export interface FolderSettingsEntry {
  folder: string[]
  auth?: TigerAuth
  docs?: string
}

const ENVIRONMENTS_DIR = 'environments'

/**
 * Every path handed to the renderer is normalized to forward slashes. The
 * renderer builds and compares paths with '/' (they double as stable ids), and
 * Windows backslash paths would silently break those comparisons — e.g. a
 * folder rename desyncing the requests inside it. Node's fs accepts forward
 * slashes on Windows, so paths coming back over IPC need no translation.
 */
const norm = (p: string): string => (sep === '\\' ? p.split(sep).join('/') : p)

async function readMeta(
  path: string
): Promise<{ name: string; method: HttpMethod; kind?: 'ws' | 'sse'; seq?: number }> {
  try {
    const r = parseRequest(await readTextFile(path))
    const seq = Number.isFinite(r.seq) ? r.seq : undefined
    return {
      name: r.name || basename(path, '.tiger'),
      method: r.method,
      ...(r.kind ? { kind: r.kind } : {}),
      ...(seq !== undefined ? { seq } : {})
    }
  } catch {
    return { name: basename(path, '.tiger'), method: 'get' }
  }
}

interface ListedFile {
  full: string
  folder: string[]
  /** A request, or a folder's own `folder.tiger` settings. */
  kind: 'request' | 'folder'
}

/** Every request file and folder.tiger under `dir`, with its folder path relative to `root`. */
async function listRequestFiles(root: string, dir: string): Promise<ListedFile[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: ListedFile[] = []
  const subdirs: string[] = []
  const rel = relative(root, dir)
  const folder = rel ? rel.split(sep) : []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === ENVIRONMENTS_DIR || entry.name.startsWith('.')) continue
      subdirs.push(full)
    } else if (entry.isFile() && entry.name === 'folder.tiger') {
      if (folder.length) files.push({ full, folder, kind: 'folder' })
    } else if (entry.isFile() && entry.name.endsWith('.tiger') && entry.name !== 'collection.tiger') {
      files.push({ full, folder, kind: 'request' })
    }
  }
  // Sibling folders are listed concurrently rather than one after another.
  const nested = await Promise.all(subdirs.map((d) => listRequestFiles(root, d)))
  return files.concat(...nested)
}

/** Parallel file reads in flight at once: fast on SSDs, far below fd limits. */
const READ_CONCURRENCY = 32

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/**
 * Requests in folder order, then in their `seq` order (the order the source
 * tool showed, kept when an import is saved), then by name.
 */
function byFolderSeqName(a: RequestEntry, b: RequestEntry): number {
  return (
    a.folder.join('/').localeCompare(b.folder.join('/')) ||
    (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER) ||
    a.name.localeCompare(b.name) ||
    a.path.localeCompare(b.path)
  )
}

async function readRequests(files: ListedFile[]): Promise<RequestEntry[]> {
  // Reads used to be awaited one file at a time; a 2,000-request collection
  // spent most of its open time waiting on the disk serially.
  const requests = files.filter((f) => f.kind === 'request')
  const acc = await mapLimit(requests, READ_CONCURRENCY, async ({ full, folder }) => ({
    ...(await readMeta(full)),
    path: norm(full),
    folder
  }))
  return acc.sort(byFolderSeqName)
}

export async function readCollection(root: string): Promise<RequestEntry[]> {
  return readRequests(await listRequestFiles(root, root))
}

/** Every folder's auth and docs, so a request inherits its folder's auth from the first send. */
async function readFolderSettings(files: ListedFile[]): Promise<FolderSettingsEntry[]> {
  const folders = files.filter((f) => f.kind === 'folder')
  const parsed = await mapLimit(folders, READ_CONCURRENCY, async ({ full, folder }) => {
    try {
      const settings = parseCollectionSettings(await readTextFile(full))
      return { folder, ...(settings.auth ? { auth: settings.auth } : {}), ...(settings.docs ? { docs: settings.docs } : {}) }
    } catch {
      return { folder }
    }
  })
  return parsed.filter((f) => f.auth || f.docs)
}

export interface EnvironmentRef {
  name: string
  path: string
}

export async function readEnvironments(root: string): Promise<EnvironmentRef[]> {
  const dir = join(root, ENVIRONMENTS_DIR)
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: EnvironmentRef[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.tiger')) continue
    const full = join(dir, entry.name)
    // One file Tiger cannot read (a typo, an unknown encoding) used to hide
    // every environment, so no {{variable}} resolved. It now only hides itself.
    try {
      const env = parseEnvironment(await readTextFile(full))
      out.push({ name: env.name || basename(entry.name, '.tiger'), path: norm(full) })
    } catch {
      /* skip the unreadable file */
    }
  }
  return out
}

export interface OpenedCollectionPayload {
  root: string
  name: string
  requests: RequestEntry[]
  environments: EnvironmentRef[]
  settings: CollectionSettings
  /** Folders with a folder.tiger (auth and docs). */
  folders: FolderSettingsEntry[]
}

/**
 * Everything the renderer needs to open a collection at `root`. Shared by the
 * open dialog, git clone and session restore.
 */
export async function readOpenedCollection(root: string): Promise<OpenedCollectionPayload> {
  let settings: CollectionSettings = {}
  try {
    settings = parseCollectionSettings(await readTextFile(join(root, 'collection.tiger')))
  } catch {
    /* optional file */
  }
  const files = await listRequestFiles(root, root)
  return {
    root: norm(root),
    name: basename(root),
    requests: await readRequests(files),
    environments: await readEnvironments(root),
    settings,
    folders: await readFolderSettings(files)
  }
}
