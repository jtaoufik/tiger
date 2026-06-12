/**
 * Pure path math for sidebar tree operations: moving a request between
 * folders, renaming a folder segment, and naming duplicates. The IO (fs
 * renames, state updates) lives with the callers; these helpers are the
 * testable rules.
 */

/** File name (last path segment) of an absolute or relative path. */
export function lastSegment(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}

/** Absolute destination for moving a request file into `targetFolder`. */
export function movedRequestPath(
  root: string,
  fromPath: string,
  targetFolder: string[]
): string {
  return [root, ...targetFolder, lastSegment(fromPath)].join('/')
}

/**
 * Rewrite an entry's folderPath after the folder at `folder` is renamed to
 * `newName`. Returns null when the entry is outside that subtree.
 */
export function renamedFolderPath(
  entryFolderPath: string[],
  folder: string[],
  newName: string
): string[] | null {
  if (entryFolderPath.length < folder.length) return null
  for (let i = 0; i < folder.length; i++) {
    if (entryFolderPath[i] !== folder[i]) return null
  }
  const next = [...entryFolderPath]
  next[folder.length - 1] = newName
  return next
}

/** "Posts copy", then "Posts copy 2", ... avoiding the given sibling names. */
export function uniqueCopyName(base: string, existing: string[]): string {
  const taken = new Set(existing)
  let candidate = `${base} copy`
  let n = 2
  while (taken.has(candidate)) candidate = `${base} copy ${n++}`
  return candidate
}
