/**
 * Pure helper for creating a new collection on disk. The renderer collects a
 * name, the main process picks a parent directory and creates the folder; this
 * module owns the one piece worth testing in isolation: turning a user-typed
 * name into a safe folder name, or rejecting it.
 */

// Path separators plus characters that are illegal or troublesome in folder
// names on macOS, Windows and Linux.
const ILLEGAL = /[\\/:*?"<>| -]/g

/**
 * Normalize a user-typed collection name into a safe folder name. Returns null
 * when nothing usable remains (empty, whitespace-only, or all-illegal).
 */
export function sanitizeCollectionName(name: string): string | null {
  const cleaned = name
    .replace(ILLEGAL, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '') // no leading dots (avoid hidden folders)
    .replace(/[. ]+$/, '') // no trailing dot/space (invalid on Windows)
    .trim()
  return cleaned.length > 0 ? cleaned : null
}
