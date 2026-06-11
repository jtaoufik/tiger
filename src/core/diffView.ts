/** Classify unified-diff lines for rendering. Pure, line-based. */

export type DiffKind = 'add' | 'del' | 'hunk' | 'meta' | 'ctx'

export interface DiffLine {
  text: string
  kind: DiffKind
}

export function classifyDiffLine(line: string): DiffKind {
  if (line.startsWith('+++') || line.startsWith('---')) return 'meta'
  if (line.startsWith('+')) return 'add'
  if (line.startsWith('-')) return 'del'
  if (line.startsWith('@@')) return 'hunk'
  if (
    line.startsWith('diff ') ||
    line.startsWith('index ') ||
    line.startsWith('new file') ||
    line.startsWith('deleted file') ||
    line.startsWith('rename ') ||
    line.startsWith('similarity ')
  ) {
    return 'meta'
  }
  return 'ctx'
}

export function splitDiff(diff: string): DiffLine[] {
  if (!diff) return []
  return diff
    .replace(/\n$/, '')
    .split('\n')
    .map((text) => ({ text, kind: classifyDiffLine(text) }))
}
