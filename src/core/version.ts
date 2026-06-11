/** Semver-lite comparison for the update checker. */

const VERSION = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/

function parse(version: string): [number, number, number] | null {
  const match = version.trim().match(VERSION)
  if (!match) return null
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)]
}

export function compareVersions(a: string, b: string): number {
  const pa = parse(a)
  const pb = parse(b)
  if (!pa || !pb) return 0
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1
  }
  return 0
}

/** True when `latest` is a valid version strictly greater than `current`. */
export function isNewerVersion(latest: string, current: string): boolean {
  if (!parse(latest) || !parse(current)) return false
  return compareVersions(latest, current) === 1
}

export interface UpdateInfo {
  latest: string
  url: string
  notes: string[]
}
