/**
 * Plain-text search for the response panel: find every occurrence of a query
 * (case-insensitive by default) and split the text into renderable segments.
 * Pure string work, no regex surprises with user input.
 */

export interface MatchRange {
  start: number
  end: number
}

export interface SearchResult {
  ranges: MatchRange[]
  /** True when more matches exist beyond the limit. */
  truncated: boolean
}

export function findMatches(
  text: string,
  query: string,
  options: { caseSensitive?: boolean; limit?: number } = {}
): SearchResult {
  const { caseSensitive = false, limit = 500 } = options
  if (!query) return { ranges: [], truncated: false }

  const haystack = caseSensitive ? text : text.toLowerCase()
  const needle = caseSensitive ? query : query.toLowerCase()
  const ranges: MatchRange[] = []

  let from = 0
  while (ranges.length < limit) {
    const at = haystack.indexOf(needle, from)
    if (at === -1) return { ranges, truncated: false }
    ranges.push({ start: at, end: at + needle.length })
    from = at + needle.length
  }
  // Limit reached: is there at least one more?
  return { ranges, truncated: haystack.indexOf(needle, from) !== -1 }
}

export interface TextSegment {
  text: string
  /** Index into the ranges array when this segment is a match, else null. */
  match: number | null
}

/** Split `text` into plain and match segments, in order, covering all of it. */
export function splitByRanges(text: string, ranges: MatchRange[]): TextSegment[] {
  if (!ranges.length) return [{ text, match: null }]
  const segments: TextSegment[] = []
  let cursor = 0
  ranges.forEach((range, i) => {
    if (range.start > cursor) segments.push({ text: text.slice(cursor, range.start), match: null })
    segments.push({ text: text.slice(range.start, range.end), match: i })
    cursor = range.end
  })
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: null })
  return segments
}
