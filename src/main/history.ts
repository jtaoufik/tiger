import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeAtomic } from './atomicWrite'
import { logMainError } from './resilience'

export interface HistoryEntry {
  id: string
  at: number
  method: string
  url: string
  status: number
  ok: boolean
  timeMs: number
  /** Entry id of the request that produced this send, when known. */
  requestId?: string
}

const MAX_ENTRIES = 200

function historyPath(): string {
  return join(app.getPath('userData'), 'history.json')
}

/** The entries as last read or written: a send must not re-read and re-parse the file. */
let cache: HistoryEntry[] | null = null
/** Writes run one after the other, off the send's reply, in the order they were asked for. */
let writing: Promise<void> = Promise.resolve()

export function readHistory(): HistoryEntry[] {
  if (cache) return cache
  try {
    const data = JSON.parse(readFileSync(historyPath(), 'utf8'))
    cache = Array.isArray(data) ? data : []
  } catch {
    cache = []
  }
  return cache
}

/**
 * Never throws and never blocks: the history is a convenience, the response
 * it records is not, and a slow disk (Windows scanning each new file) must
 * not hold the reply to the renderer.
 */
function persist(entries: HistoryEntry[]): void {
  const text = JSON.stringify(entries, null, 2)
  writing = writing
    .then(() => writeAtomic(historyPath(), text))
    .catch((e) => logMainError('history', e))
}

/** Resolves once every write asked for so far is on disk (tests, shutdown). */
export function flushHistory(): Promise<void> {
  return writing
}

export function appendHistory(entry: HistoryEntry): HistoryEntry[] {
  const next = [entry, ...readHistory()].slice(0, MAX_ENTRIES)
  cache = next
  persist(next)
  return next
}

export function clearHistory(): void {
  cache = []
  persist([])
}
