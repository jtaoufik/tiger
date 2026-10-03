/**
 * Save a collection that only lives in memory (an import, the sample) as a
 * folder of .tiger files, so it survives a restart, Ctrl+S works on it and
 * it can be shared with git like any other collection.
 */
import { access, mkdir, writeFile } from 'node:fs/promises'
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
  const checked = files.map((f) => ({ parts: segments(f.path), content: f.content }))
  const base = sanitizeCollectionName(name) ?? 'Collection'
  let root = join(parentDir, base)
  for (let n = 2; await exists(root); n++) root = join(parentDir, `${base} ${n}`)
  await mkdir(root, { recursive: true })

  let next = 0
  const worker = async (): Promise<void> => {
    while (next < checked.length) {
      const { parts, content } = checked[next++]
      const target = join(root, ...parts)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, content, 'utf8')
    }
  }
  await Promise.all(Array.from({ length: Math.min(WRITE_CONCURRENCY, checked.length) }, worker))
  return root
}
