/**
 * The files that store a collection on disk, laid out the way Tiger opens
 * them: one `.tiger` file per request inside its folder, `folder.tiger` and
 * `collection.tiger` for folder and collection settings, and
 * `environments/<name>.tiger` for each environment.
 *
 * Saving an import (or a collection that only lived in memory) is writing
 * these files. Pure, so the naming rules are unit-tested: names that Windows
 * refuses ("a/b", "Get: user?", CON, a trailing dot) still give valid files,
 * two requests never share a file, and the import order survives as `seq`.
 */

import { serializeCollectionSettings } from './collectionSettings'
import { serializeEnvironment } from './environment'
import { serializeRequest } from './tigerFormat'
import type { TigerAuth, TigerEnvironment, TigerRequest } from './types'

export interface CollectionFile {
  /** Relative to the collection root, '/'-separated. */
  path: string
  content: string
}

export interface CollectionSnapshot {
  name: string
  requests: Array<{ path: string[]; request: TigerRequest }>
  folders?: Array<{ path: string[]; auth?: TigerAuth; docs?: string }>
  environments?: TigerEnvironment[]
  auth?: TigerAuth
  docs?: string
}

export interface CollectionLayout {
  files: CollectionFile[]
  /** Where each request went, by its index in `snapshot.requests`. */
  requestPaths: string[]
}

/** Device names Windows reserves, with or without an extension ("nul.tiger"). */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])$/i
/** Long enough to read, short enough to keep deep folders under Windows' 260-character paths. */
const MAX_NAME = 60

/** A file or folder name valid on Windows, macOS and Linux. */
export function safeFileName(name: string, fallback: string): string {
  let out = name
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
  const chars = Array.from(out)
  if (chars.length > MAX_NAME) out = chars.slice(0, MAX_NAME).join('')
  out = out.replace(/[. ]+$/, '').trim()
  if (!out) out = fallback
  if (WINDOWS_RESERVED.test(out.split('.')[0])) out = `${out}_`
  return out
}

/**
 * `base`, else `base 2`, `base 3`... Case-insensitive, because the Windows
 * and macOS file systems are: "Users" and "users" would be the same file.
 * `taken` holds lowercase names and gets the chosen one added.
 */
export function uniqueName(base: string, taken: Set<string>): string {
  let name = base
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} ${n}`
  taken.add(name.toLowerCase())
  return name
}

export function collectionFiles(snapshot: CollectionSnapshot): CollectionLayout {
  const files: CollectionFile[] = []
  /** Names used in each directory ('' = the root). */
  const takenIn = new Map<string, Set<string>>()
  const taken = (dir: string): Set<string> => {
    let set = takenIn.get(dir)
    if (!set) {
      // Tiger's own files, which a request named "folder" or "collection"
      // must not overwrite, and "environments", a folder name Tiger skips
      // when it lists requests.
      set = new Set(dir ? ['folder', 'environments'] : ['collection', 'environments'])
      takenIn.set(dir, set)
    }
    return set
  }

  /** Each source folder path, once, mapped to its directory on disk. */
  const dirs = new Map<string, string>()
  const dirFor = (path: string[]): string => {
    if (path.length === 0) return ''
    const key = JSON.stringify(path)
    const known = dirs.get(key)
    if (known !== undefined) return known
    const parent = dirFor(path.slice(0, -1))
    const name = uniqueName(safeFileName(path[path.length - 1], 'Folder'), taken(parent))
    const dir = parent ? `${parent}/${name}` : name
    dirs.set(key, dir)
    return dir
  }

  const seqIn = new Map<string, number>()
  const requestPaths = snapshot.requests.map(({ path, request }) => {
    const dir = dirFor(path)
    const file = `${uniqueName(safeFileName(request.name, 'Request'), taken(dir))}.tiger`
    // The order the source tool showed survives a reload, which sorts by seq.
    const seq = (seqIn.get(dir) ?? 0) + 1
    seqIn.set(dir, seq)
    const rel = dir ? `${dir}/${file}` : file
    files.push({ path: rel, content: serializeRequest({ ...request, seq }) })
    return rel
  })

  for (const folder of snapshot.folders ?? []) {
    const content = serializeCollectionSettings({ auth: folder.auth, docs: folder.docs })
    if (!content || folder.path.length === 0) continue
    files.push({ path: `${dirFor(folder.path)}/folder.tiger`, content })
  }

  // The display name is kept exactly, even when the folder name had to change.
  files.push({
    path: 'collection.tiger',
    content: serializeCollectionSettings({ name: snapshot.name, auth: snapshot.auth, docs: snapshot.docs })
  })

  const envNames = new Set<string>()
  for (const env of snapshot.environments ?? []) {
    const file = uniqueName(safeFileName(env.name, 'Environment'), envNames)
    files.push({ path: `environments/${file}.tiger`, content: serializeEnvironment(env) })
  }

  return { files, requestPaths }
}
