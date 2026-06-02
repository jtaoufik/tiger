import { readdir, readFile } from 'node:fs/promises'
import { basename, join, relative, sep } from 'node:path'
import { parseRequest } from '../core/tigerFormat'
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
    } else if (entry.isFile() && entry.name.endsWith('.tiger')) {
      const meta = await readMeta(full)
      const folder = relative(root, dir)
      acc.push({ ...meta, path: full, folder: folder ? folder.split(sep) : [] })
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
      out.push({ name: env.name || basename(entry.name, '.tiger'), path: full })
    }
    return out
  } catch {
    return []
  }
}
