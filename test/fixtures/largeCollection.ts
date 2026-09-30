/**
 * Synthetic "large collection" used by the performance tests: 2,000 requests
 * spread over 200 folders (20 top-level folders with 9 subfolders each, and
 * requests in the subfolders). Deterministic, so numbers compare run to run.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SidebarCollection, SidebarEntry } from '../../src/renderer/src/components/Sidebar'
import type { HttpMethod } from '../../src/core/types'

/** 20 top-level folders + 20 x 9 subfolders = 200 folders. */
export const LARGE = { topFolders: 20, subFolders: 9 } as const
export const LARGE_FOLDERS = LARGE.topFolders * (1 + LARGE.subFolders)
export const LARGE_REQUESTS = 2000

const METHODS: HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete']
const NOUNS = ['orders', 'users', 'invoices', 'products', 'carts', 'payments', 'reviews', 'coupons']

export function largeRequests(): SidebarEntry[] {
  const subfolders: string[][] = []
  for (let t = 0; t < LARGE.topFolders; t++) {
    const top = `Service ${String(t + 1).padStart(2, '0')}`
    for (let s = 0; s < LARGE.subFolders; s++) subfolders.push([top, `${NOUNS[s % NOUNS.length]} ${s + 1}`])
  }
  const out: SidebarEntry[] = []
  for (let n = 1; n <= LARGE_REQUESTS; n++) {
    const folderPath = subfolders[(n - 1) % subfolders.length]
    const method = METHODS[n % METHODS.length]
    const name = `${method === 'get' ? 'List' : 'Change'} ${NOUNS[n % NOUNS.length]} ${String(n).padStart(4, '0')}`
    out.push({ id: `/large/${folderPath.join('/')}/req-${n}.tiger`, name, method, folderPath })
  }
  // Same order the main process hands over (folder path, then name).
  return out.sort(
    (a, b) => a.folderPath.join('/').localeCompare(b.folderPath.join('/')) || a.name.localeCompare(b.name)
  )
}

export function largeSidebarCollection(): SidebarCollection {
  return { id: '/large', name: 'Large API', root: '/large', entries: largeRequests() }
}

/** Write the collection as real .tiger files under `root` (for disk-read timing). */
export async function writeLargeCollection(root: string): Promise<void> {
  const reqs = largeRequests()
  for (const d of new Set(reqs.map((r) => r.folderPath.join('\u0000')))) {
    await mkdir(join(root, ...d.split('\u0000')), { recursive: true })
  }
  await Promise.all(
    reqs.map((r, i) =>
      writeFile(
        join(root, ...r.folderPath, `req-${i + 1}.tiger`),
        `meta {\n  name: ${r.name}\n  seq: ${i + 1}\n}\n\n${r.method} {\n  url: https://api.example.com/v1/items/${i + 1}\n}\n\nheaders {\n  Accept: application/json\n}\n`
      )
    )
  )
}
