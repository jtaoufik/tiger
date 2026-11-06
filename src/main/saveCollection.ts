/**
 * Save a collection that only lives in memory (an import, the sample) as a
 * folder of .tiger files, so it survives a restart, Ctrl+S works on it and
 * it can be shared with git like any other collection.
 */
import { access, mkdir, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { sanitizeCollectionName } from '../core/newCollection'
import type { CollectionFile } from '../core/collectionFiles'

/** Files written at once: quick on an SSD, far below file-handle limits. */
const WRITE_CONCURRENCY = 16

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * The relative path as segments, or an error for anything that could leave
 * the collection folder ("..", an absolute or drive path) or that a file
 * system refuses.
 */
function segments(path: string): string[] {
  const parts = path.split('/')
  const bad = (p: string) =>
    !p || p === '.' || p === '..' || /[\\:*?"<>|\u0000-\u001f]/.test(p) || /[. ]$/.test(p)
  if (parts.some(bad)) throw new Error(`Invalid file path in collection: ${path}`)
  return parts
}

/** Files a file manager drops into any folder; they do not make it "in use". */
const OS_CLUTTER = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini'])

/** True when `dir` holds nothing but file manager clutter. */
export async function isEmptyFolder(dir: string): Promise<boolean> {
  const names = await readdir(dir)
  return names.every((n) => OS_CLUTTER.has(n))
}

/**
 * The folder `saveCollectionFiles` would create in `parentDir` for `name`:
 * "My API", else "My API 2"... Never one that exists.
 */
export async function freeCollectionFolder(parentDir: string, name: string): Promise<string> {
  const base = sanitizeCollectionName(name) ?? 'Collection'
  let root = join(parentDir, base)
  for (let n = 2; await exists(root); n++) root = join(parentDir, `${base} ${n}`)
  return root
}

/**
 * Write `files` under `root`. The 'wx' flag refuses to replace a file that
 * is already there: saving never overwrites anything, even in a race.
 */
async function writeAll(root: string, files: CollectionFile[]): Promise<void> {
  const checked = files.map((f) => ({ parts: segments(f.path), content: f.content }))
  await mkdir(root, { recursive: true })

  let next = 0
  const worker = async (): Promise<void> => {
    while (next < checked.length) {
      const { parts, content } = checked[next++]
      const target = join(root, ...parts)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, content, { encoding: 'utf8', flag: 'wx' })
    }
  }
  await Promise.all(Array.from({ length: Math.min(WRITE_CONCURRENCY, checked.length) }, worker))
}

/**
 * Write `files` into a new folder named after the collection inside
 * `parentDir` ("My API", else "My API 2"...), never into an existing one.
 * Returns the new collection root.
 */
export async function saveCollectionFiles(
  parentDir: string,
  name: string,
  files: CollectionFile[]
): Promise<string> {
  files.forEach((f) => segments(f.path))
  const root = await freeCollectionFolder(parentDir, name)
  await writeAll(root, files)
  return root
}

/**
 * Write `files` straight into `dir`, a folder the user picked. Refuses a
 * folder that already holds something: the caller asks for another folder
 * or a subfolder instead. Returns `dir`.
 */
export async function saveCollectionInto(dir: string, files: CollectionFile[]): Promise<string> {
  files.forEach((f) => segments(f.path))
  if (!(await isEmptyFolder(dir))) throw new Error(`Folder is not empty: ${dir}`)
  await writeAll(dir, files)
  return dir
}
