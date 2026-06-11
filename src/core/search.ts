/**
 * Fuzzy matching for the command palette. Classic subsequence scoring: every
 * query character must appear in order; word-start hits and consecutive runs
 * score higher, gaps cost a little.
 */

export interface SearchItem {
  id: string
  name: string
  collection: string
  method: string
}

/** Score a query against a target, or null when it is not a subsequence. */
export function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (!q) return 0

  let score = 0
  let ti = 0
  let lastHit = -2

  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found === -1) return null
    if (found === 0 || t[found - 1] === ' ' || t[found - 1] === '-' || t[found - 1] === '/') {
      score += 2 // word start
    }
    if (found === lastHit + 1) score += 3 // consecutive runs beat scattered word starts
    score -= (found - ti) * 0.2 // gap penalty
    lastHit = found
    ti = found + 1
  }
  return score
}

export function searchItems(items: SearchItem[], query: string, limit = 8): SearchItem[] {
  const q = query.trim()
  if (!q) return items.slice(0, limit)

  return items
    .map((item) => {
      const byName = fuzzyScore(q, item.name)
      const byCollection = fuzzyScore(q, item.collection)
      const score =
        byName !== null && byCollection !== null
          ? Math.max(byName + 1, byCollection)
          : byName !== null
            ? byName + 1 // prefer name hits over collection hits
            : byCollection
      return { item, score }
    })
    .filter((r): r is { item: SearchItem; score: number } => r.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.item)
}
