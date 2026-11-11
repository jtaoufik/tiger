/** Semver-lite comparison for the update checker. */

const VERSION = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

interface Parsed {
  core: [number, number, number]
  /** Pre-release identifiers (`rc.1` gives ["rc", "1"]); empty for a release. */
  pre: string[]
}

function parse(version: string): Parsed | null {
  const match = version.trim().match(VERSION)
  if (!match) return null
  return {
    core: [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)],
    pre: match[4] ? match[4].split('.') : []
  }
}

/**
 * Semver 2.0 section 11: a release is above its pre-releases; identifiers
 * compare numerically when both are numbers, else as text, and a number is
 * below a word; a longer list wins when every shared identifier is equal.
 */
function comparePre(a: string[], b: string[]): number {
  if (!a.length || !b.length) return Number(!a.length) - Number(!b.length)
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i]
    const y = b[i]
    if (x === y) continue
    const nx = /^\d+$/.test(x)
    const ny = /^\d+$/.test(y)
    if (nx && ny) return Number(x) > Number(y) ? 1 : -1
    if (nx !== ny) return nx ? -1 : 1
    return x > y ? 1 : -1
  }
  return Math.sign(a.length - b.length)
}

export function compareVersions(a: string, b: string): number {
  const pa = parse(a)
  const pb = parse(b)
  if (!pa || !pb) return 0
  for (let i = 0; i < 3; i++) {
    if (pa.core[i] !== pb.core[i]) return pa.core[i] > pb.core[i] ? 1 : -1
  }
  return comparePre(pa.pre, pb.pre)
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
