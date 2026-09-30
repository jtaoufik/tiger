/**
 * Shared helpers for the file-based importers (Postman, Insomnia, OpenAPI,
 * WSDL). Bruno has its own folder walker because `.bru` files come in mixed
 * roles (requests, collection metadata, environments) that need per-file
 * classification — see `importers.ts`.
 *
 * Kept free of Electron deps so it can be unit-tested without a renderer.
 */

import { readdir, stat } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import type { TigerEnvironment } from '../core/types'
import type {
  ImportedFolder,
  ImportResult,
  ImportSource,
  ImportedRequest,
  ImportWarning
} from '../core/import'
import { layerCollectionVariables } from '../core/import/report'

/**
 * Resolve a list of user-picked paths (mix of files and directories) into a
 * flat list of matching files. Directories are walked recursively; dotfiles
 * and dotdirs are skipped. Extensions are matched case-insensitively.
 */
export async function expandPaths(paths: string[], exts: string[]): Promise<string[]> {
  const allowed = new Set(exts.map((e) => '.' + e.toLowerCase()))
  const out: string[] = []
  for (const p of paths) {
    const st = await stat(p).catch(() => null)
    if (!st) continue
    if (st.isDirectory()) await walkDir(p, allowed, out)
    else if (st.isFile()) out.push(p)
  }
  return out
}

async function walkDir(dir: string, allowed: Set<string>, out: string[]): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) await walkDir(full, allowed, out)
    else if (entry.isFile() && allowed.has(extname(entry.name).toLowerCase())) out.push(full)
  }
}

/**
 * Pick a friendly collection name from the user's selection. A single file
 * uses its basename (no extension); multiple selections fall back to their
 * common parent directory.
 */
export function rootNameFor(paths: string[]): string {
  if (paths.length === 0) return 'Imported collection'
  if (paths.length === 1) return basename(paths[0], extname(paths[0])) || 'Imported collection'
  const parent = basename(dirname(paths[0]))
  return parent || 'Imported collection'
}

/**
 * Merge several per-file `ImportResult`s into one. Each result's requests are
 * tucked under a folder named after the source file so multiple collections
 * don't collide at the root; a file's collection-level auth and docs become
 * that folder's settings. Environments and warnings are concatenated.
 *
 * When only one file holds requests (a collection dropped together with its
 * environment exports, say), it stays at the root and keeps its own name.
 */
export function mergeImports(
  items: { name: string; result: ImportResult }[],
  source: ImportSource,
  name: string
): ImportResult {
  const withRequests = items.filter((i) => i.result.requests.length > 0)
  const single = withRequests.length === 1 && items.length > 1 ? withRequests[0] : undefined
  const requests: ImportedRequest[] = []
  const environments: TigerEnvironment[] = []
  const folders: ImportedFolder[] = []
  const warnings: ImportWarning[] = []
  for (const item of items) {
    const { name: prefix } = item
    const nest = item !== single
    // Each nested collection keeps its own variables as its own environment;
    // the root collection's are layered over every environment afterwards.
    const result = nest ? layerCollectionVariables(item.result) : item.result
    const under = (path: string[] | undefined): string[] => (nest ? [prefix, ...(path ?? [])] : (path ?? []))
    for (const req of result.requests) {
      requests.push({ path: under(req.path), request: req.request })
    }
    if (result.environments) environments.push(...result.environments)
    for (const f of result.folders ?? []) folders.push({ ...f, path: under(f.path) })
    if (nest && (result.auth || result.docs) && result.requests.length) {
      folders.push({
        path: [prefix],
        ...(result.auth ? { auth: result.auth } : {}),
        ...(result.docs ? { docs: result.docs } : {})
      })
    }
    for (const w of result.warnings ?? []) {
      warnings.push({ ...w, path: under(w.path) })
    }
  }
  return {
    name: single ? single.result.name : name,
    source: single ? single.result.source : source,
    requests,
    ...(environments.length > 0 ? { environments } : {}),
    ...(single?.result.collectionVariables
      ? { collectionVariables: single.result.collectionVariables }
      : {}),
    ...(single?.result.auth ? { auth: single.result.auth } : {}),
    ...(single?.result.docs ? { docs: single.result.docs } : {}),
    ...(folders.length > 0 ? { folders } : {}),
    ...(warnings.length > 0 ? { warnings } : {})
  }
}
