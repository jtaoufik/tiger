import { readdir, readFile } from 'node:fs/promises'
import { basename, join, relative, sep } from 'node:path'
import { parseRequest } from '../core/tigerFormat'
import { parseCollectionSettings, type CollectionSettings } from '../core/collectionSettings'
import { parseEnvironment } from '../core/environment'
import type { HttpMethod } from '../core/types'

export interface RequestEntry {
  name: string
  method: HttpMethod
  path: string
  /** Folder names from the collection root down to (but not including) the file. */
  folder: string[]
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

async function readMeta(path: string): Promise<{ name: string; method: HttpMethod }> {
  try {
    const r = parseRequest(await readFile(path, 'utf8'))
    return { name: r.name || basename(path, '.tiger'), method: r.method }
  } catch {
    return { name: basename(path, '.tiger'), method: 'get' }
  }
}

async function walk(root: string, dir: string, acc: RequestEntry[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === ENVIRONMENTS_DIR || entry.name.startsWith('.')) continue
      await walk(root, full, acc)
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.tiger') &&
      entry.name !== 'collection.tiger' &&
      entry.name !== 'folder.tiger'
    ) {
      const meta = await readMeta(full)
      const folder = relative(root, dir)
      acc.push({ ...meta, path: norm(full), folder: folder ? folder.split(sep) : [] })
    }
  }
}

export async function readCollection(root: string): Promise<RequestEntry[]> {
  const acc: RequestEntry[] = []
  await walk(root, root, acc)
  return acc.sort(
    (a, b) => a.folder.join('/').localeCompare(b.folder.join('/')) || a.name.localeCompare(b.name)
  )
}

export interface EnvironmentRef {
  name: string
  path: string
}

export async function readEnvironments(root: string): Promise<EnvironmentRef[]> {
  const dir = join(root, ENVIRONMENTS_DIR)
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    const out: EnvironmentRef[] = []
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.tiger')) continue
      const full = join(dir, entry.name)
      const env = parseEnvironment(await readFile(full, 'utf8'))
      out.push({ name: env.name || basename(entry.name, '.tiger'), path: norm(full) })
    }
    return out
  } catch {
    return []
  }
}

export interface OpenedCollectionPayload {
  root: string
  name: string
  requests: RequestEntry[]
  environments: EnvironmentRef[]
  settings: CollectionSettings
}

/**
 * Everything the renderer needs to open a collection at `root`. Shared by the
 * open dialog, git clone and session restore.
 */
export async function readOpenedCollection(root: string): Promise<OpenedCollectionPayload> {
  let settings: CollectionSettings = {}
  try {
    settings = parseCollectionSettings(await readFile(join(root, 'collection.tiger'), 'utf8'))
  } catch {
    /* optional file */
  }
  return {
    root: norm(root),
    name: basename(root),
    requests: await readCollection(root),
    environments: await readEnvironments(root),
    settings
  }
}
