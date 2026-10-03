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
import { looksLikeProduction } from '../core/environment'
import type { KeyValue, TigerAuth, TigerEnvironment, TigerRequest } from '../core/types'
import type {
  ImportedFolder,
  ImportResult,
  ImportSource,
  ImportedRequest,
  ImportWarning
} from '../core/import'
import { warning } from '../core/import/common'
import { layerCollectionVariables } from '../core/import/report'

/**
 * Resolve a list of user-picked paths (mix of files and directories) into a
 * flat list of matching files. Directories are walked recursively; dotfiles,
 * dotdirs and node_modules are skipped. Extensions are matched
 * case-insensitively.
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

/**
 * The files of a dropped folder, like `expandPaths`, except that a folder
 * holding a `bruno.json` is a Bruno collection: it is returned as a root to
 * read whole (its collection.bru, folder.bru and environments are not
 * requests), not walked file by file.
 */
export async function scanDroppedFolder(dir: string, exts: string[]): Promise<{ files: string[]; brunoRoots: string[] }> {
  const files: string[] = []
  const brunoRoots: string[] = []
  await walkDir(dir, new Set(exts.map((e) => '.' + e.toLowerCase())), files, brunoRoots)
  return { files, brunoRoots }
}

async function walkDir(dir: string, allowed: Set<string>, out: string[], brunoRoots?: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true })
  if (brunoRoots && entries.some((e) => e.isFile() && e.name === 'bruno.json')) {
    brunoRoots.push(dir)
    return
  }
  for (const entry of entries) {
    // A project folder's dependencies hold thousands of files that are not the user's.
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) await walkDir(full, allowed, out, brunoRoots)
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

/** `{{name}}`, read the way interpolate.ts reads it. */
const TOKEN = /\{\{\s*([\w.$-]+(?:[ \t]+[\w.$-]+)*)\s*\}\}/g
/** A script naming a variable: pm.environment.get('x'), pm.collectionVariables.set('x', v), bru.setVar('x', v)... */
const SCRIPT_VAR =
  /((?:\b(?:environment|collectionVariables|variables)\.(?:get|set|unset|has)|\bbru\.(?:getEnvVar|setEnvVar|getVar|setVar))\(\s*)(['"`])([^'"`\\\n]+)\2/g

function renameIn(text: string, renames: Map<string, string>): string {
  return text
    .replace(TOKEN, (match, name: string) => (renames.has(name) ? `{{${renames.get(name)}}}` : match))
    .replace(SCRIPT_VAR, (match, call: string, quote: string, name: string) =>
      renames.has(name) ? `${call}${quote}${renames.get(name)}${quote}` : match
    )
}

function renameVariables(vars: KeyValue[], renames: Map<string, string>): KeyValue[] {
  return vars.map((v) => ({ ...v, name: renames.get(v.name) ?? v.name, value: renameIn(v.value, renames) }))
}

function renameAuth(auth: TigerAuth, renames: Map<string, string>): TigerAuth {
  return Object.fromEntries(
    Object.entries(auth).map(([key, value]) => [key, typeof value === 'string' ? renameIn(value, renames) : value])
  ) as TigerAuth
}

function renameRequest(req: TigerRequest, renames: Map<string, string>): TigerRequest {
  const rows = (list: KeyValue[]) =>
    list.map((kv) => ({ ...kv, name: renameIn(kv.name, renames), value: renameIn(kv.value, renames) }))
  return {
    ...req,
    url: renameIn(req.url, renames),
    headers: rows(req.headers),
    query: rows(req.query),
    body: {
      ...req.body,
      content: renameIn(req.body.content, renames),
      ...(req.body.variables !== undefined ? { variables: renameIn(req.body.variables, renames) } : {})
    },
    ...(req.auth ? { auth: renameAuth(req.auth, renames) } : {}),
    ...(req.preScript !== undefined ? { preScript: renameIn(req.preScript, renames) } : {}),
    ...(req.postScript !== undefined ? { postScript: renameIn(req.postScript, renames) } : {})
  }
}

interface ScopedCollection {
  /** The collection with its own environments, its variables renamed where they clash. */
  result: ImportResult
  /** Its variables as every other environment should see them. */
  defaults: KeyValue[]
  /** Original name -> name in Tiger, for the variables that clashed. */
  renames: Map<string, string>
}

/**
 * Collections imported together end up in one Tiger collection with one
 * variable scope, where the source tool kept each collection's variables
 * apart: one collection's baseUrl would send the other's requests to the
 * wrong host. So each collection's variables go under every environment
 * with the values of its own first environment (never a production one),
 * and a name an earlier collection already uses is renamed in the later one
 * (baseUrl -> Beta.baseUrl), unless both give it the same value. A name with
 * no value yet (a token to fill in) is never shared between two APIs.
 */
function scopeCollections(items: Array<{ name: string; result: ImportResult }>): Map<unknown, ScopedCollection> {
  const claimed = new Map<string, { value: string; shareable: boolean }>()
  const scopes = new Set<string>()
  const out = new Map<unknown, ScopedCollection>()
  for (const item of items) {
    const own = item.result.collectionVariables ?? []
    // With environments of its own (Bruno, OpenAPI, Insomnia), its collection
    // variables sit under them, as in the source tool.
    const layered = item.result.environments?.length ? layerCollectionVariables(item.result) : item.result
    const envs = layered.environments ?? []
    const first = envs.find((e) => !looksLikeProduction(e.name))
    const defaults = envs.length ? (first?.variables ?? own) : own
    const shareable = envs.length === 0

    // The collection's name, as a variable name prefix: "Shop API" -> Shop_API.baseUrl.
    const base = (item.result.name || item.name).replace(/[^\w.-]+/g, '_').replace(/^[_.]+|[_.]+$/g, '') || 'Collection'
    let scope = base
    for (let n = 2; scopes.has(scope); n++) scope = `${base}_${n}`
    scopes.add(scope)

    const defined = new Set([...defaults, ...envs.flatMap((e) => e.variables)].map((v) => v.name))
    const valueOf = (name: string) => defaults.find((v) => v.name === name)?.value ?? ''
    const renames = new Map<string, string>()
    for (const name of defined) {
      const earlier = claimed.get(name)
      if (!earlier) continue
      if (shareable && earlier.shareable && valueOf(name) && valueOf(name) === earlier.value) continue
      let to = `${scope}.${name}`
      for (let n = 2; claimed.has(to) || defined.has(to); n++) to = `${scope}.${name}_${n}`
      renames.set(name, to)
    }
    for (const name of defined) {
      const to = renames.get(name) ?? name
      if (!claimed.has(to)) claimed.set(to, { value: valueOf(name), shareable })
    }

    // Its collection variables are in `defaults` now.
    const { collectionVariables: _inDefaults, ...kept } = layered
    const renamed: ImportResult = {
      ...kept,
      requests: kept.requests.map((r) => ({ ...r, request: renameRequest(r.request, renames) })),
      ...(kept.environments
        ? { environments: kept.environments.map((e) => ({ ...e, variables: renameVariables(e.variables, renames) })) }
        : {}),
      ...(kept.folders ? { folders: kept.folders.map((f) => (f.auth ? { ...f, auth: renameAuth(f.auth, renames) } : f)) } : {}),
      ...(kept.auth ? { auth: renameAuth(kept.auth, renames) } : {})
    }
    out.set(item, { result: renames.size ? renamed : kept, defaults: renameVariables(defaults, renames), renames })
  }
  return out
}

/**
 * Merge several per-file `ImportResult`s into one. Each result's requests are
 * tucked under a folder named after the source file so multiple collections
 * don't collide at the root; a file's collection-level auth and docs become
 * that folder's settings. Environments and warnings are concatenated, and
 * each collection keeps its own variable values (see `scopeCollections`).
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
  const scoped = withRequests.length > 1 ? scopeCollections(withRequests) : new Map<unknown, ScopedCollection>()
  // An environment exported on its own (not a collection's) wins over every
  // collection's values in Postman: a renamed variable follows it there.
  const renamed = [...scoped.values()].flatMap((c) => [...c.renames])
  const followRenames = (env: TigerEnvironment): TigerEnvironment => {
    const set = new Set(env.variables.filter((v) => v.enabled !== false).map((v) => v.name))
    const follow = renamed.filter(([from, to]) => set.has(from) && !set.has(to))
    if (!follow.length) return env
    return { ...env, variables: [...env.variables, ...follow.map(([from, to]) => ({ name: to, value: `{{${from}}}`, enabled: true }))] }
  }
  const requests: ImportedRequest[] = []
  const environments: TigerEnvironment[] = []
  const folders: ImportedFolder[] = []
  const warnings: ImportWarning[] = []
  const globals: KeyValue[] = []
  for (const item of items) {
    const { name: prefix } = item
    const nest = item !== single
    // Globals apply to everything: they are layered under every environment afterwards.
    const { globals: own, ...rest } = item.result
    globals.push(...(own ?? []))
    // A collection imported with others keeps its variables apart (above);
    // the root collection's are layered over every environment afterwards.
    const collection = scoped.get(item)
    const result = collection ? collection.result : nest ? layerCollectionVariables(rest) : rest
    const under = (path: string[] | undefined): string[] => (nest ? [prefix, ...(path ?? [])] : (path ?? []))
    for (const req of result.requests) {
      requests.push({ path: under(req.path), request: req.request })
    }
    if (result.environments) environments.push(...(collection ? result.environments : result.environments.map(followRenames)))
    for (const f of result.folders ?? []) folders.push({ ...f, path: under(f.path) })
    if (nest && (result.auth || result.docs) && result.requests.length) {
      folders.push({
        path: [prefix],
        ...(result.auth ? { auth: result.auth } : {}),
        ...(result.docs ? { docs: result.docs } : {})
      })
    }
    if (collection?.renames.size) {
      warnings.push({
        request: prefix,
        path: [],
        ...warning('imports.variablesRenamed', {
          names: [...collection.renames.keys()].join(', '),
          renamed: [...collection.renames.values()].join(', ')
        })
      })
    }
    for (const w of result.warnings ?? []) {
      warnings.push({ ...w, path: under(w.path) })
    }
  }
  const defaults = [...scoped.values()].flatMap((c) => c.defaults)
  const collectionVariables = single
    ? single.result.collectionVariables
    : defaults.filter((v, i) => defaults.findIndex((d) => d.name === v.name) === i)
  return {
    name: single ? single.result.name : name,
    source: single ? single.result.source : source,
    requests,
    ...(environments.length > 0 ? { environments } : {}),
    ...(globals.length > 0 ? { globals } : {}),
    ...(collectionVariables?.length ? { collectionVariables } : {}),
    ...(single?.result.auth ? { auth: single.result.auth } : {}),
    ...(single?.result.docs ? { docs: single.result.docs } : {}),
    ...(folders.length > 0 ? { folders } : {}),
    ...(warnings.length > 0 ? { warnings } : {})
  }
}
