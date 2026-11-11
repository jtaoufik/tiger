/**
 * Write a file so that a crash, a power cut or a full disk half-way through
 * never leaves a truncated file behind: the data goes to a temporary file in
 * the same folder, which then takes the target's place. The reader sees the
 * old file or the new one, never a torn one. Used for settings.json,
 * history.json, cookies.json and every .tiger file the app saves.
 */
import { chmodSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { chmod, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises'

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

/**
 * A rename does not follow a symlink at the destination: the file a symlinked
 * target points at (a settings.json kept in a dotfiles folder, an environment
 * file linked into a collection) is the one to replace, so the link stays.
 * A target that does not exist yet is used as given.
 */
function realTargetSync(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

/** The target's permissions (a 0600 secrets file) carried over to the file that replaces it. */
function keepModeSync(target: string, temp: string): void {
  try {
    chmodSync(temp, statSync(target).mode & 0o7777)
  } catch {
    /* no target yet, or a file system without modes */
  }
}

export function writeAtomicSync(path: string, data: string | Uint8Array): void {
  const target = realTargetSync(path)
  const temp = tempPath(target)
  try {
    writeFileSync(temp, data)
    keepModeSync(target, temp)
    try {
      renameSync(temp, target)
    } catch (e) {
      if (!shouldRetry(e)) throw e
      try {
        unlinkSync(target)
      } catch {
        /* already gone, or held open */
      }
      try {
        renameSync(temp, target)
      } catch (again) {
        // Still held open by another program (a sync client, an antivirus
        // scan): the plain in-place write that always saved on Windows still
        // does, at the cost of atomicity.
        if (!shouldRetry(again)) throw again
        writeFileSync(target, data)
      }
    }
  } finally {
    // Gone after a successful rename; left behind by a failure or the in-place write.
    try {
      unlinkSync(temp)
    } catch {
      /* never written, or renamed into place */
    }
  }
}

export async function writeAtomic(path: string, data: string | Uint8Array): Promise<void> {
  const target = await realpath(path).catch(() => path)
  const temp = tempPath(target)
  try {
    await writeFile(temp, data)
    await stat(target)
      .then((st) => chmod(temp, st.mode & 0o7777))
      .catch(() => undefined)
    try {
      await rename(temp, target)
    } catch (e) {
      if (!shouldRetry(e)) throw e
      await unlink(target).catch(() => undefined)
      try {
        await rename(temp, target)
      } catch (again) {
        // Held open by another program: written in place, as in writeAtomicSync.
        if (!shouldRetry(again)) throw again
        await writeFile(target, data)
      }
    }
  } finally {
    await unlink(temp).catch(() => undefined)
  }
}
