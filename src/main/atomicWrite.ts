/**
 * Write a file so that a crash, a power cut or a full disk half-way through
 * never leaves a truncated file behind: the data goes to a temporary file in
 * the same folder, which then takes the target's place. The reader sees the
 * old file or the new one, never a torn one. Used for settings.json,
 * history.json, cookies.json and every .tiger file the app saves.
 */
import { renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { rename, unlink, writeFile } from 'node:fs/promises'

let counter = 0

/** A temporary name next to `path`, unique per process and call. */
function tempPath(path: string): string {
  counter = (counter + 1) % 1_000_000
  return `${path}.${process.pid}.${counter}.tmp`
}

/**
 * Windows refuses to rename over a file another program holds open (EPERM)
 * or, on some file systems, over any existing file (EEXIST). One retry after
 * removing the target is enough; POSIX renames replace atomically.
 */
function shouldRetry(e: unknown): boolean {
  const code = (e as NodeJS.ErrnoException).code
  return process.platform === 'win32' && (code === 'EPERM' || code === 'EEXIST')
}

export function writeAtomicSync(path: string, data: string | Uint8Array): void {
  const temp = tempPath(path)
  try {
    writeFileSync(temp, data)
    try {
      renameSync(temp, path)
    } catch (e) {
      if (!shouldRetry(e)) throw e
      try {
        unlinkSync(path)
      } catch {
        /* already gone */
      }
      renameSync(temp, path)
    }
  } catch (e) {
    try {
      unlinkSync(temp)
    } catch {
      /* never written */
    }
    throw e
  }
}

export async function writeAtomic(path: string, data: string | Uint8Array): Promise<void> {
  const temp = tempPath(path)
  try {
    await writeFile(temp, data)
    try {
      await rename(temp, path)
    } catch (e) {
      if (!shouldRetry(e)) throw e
      await unlink(path).catch(() => undefined)
      await rename(temp, path)
    }
  } catch (e) {
    await unlink(temp).catch(() => undefined)
    throw e
  }
}
