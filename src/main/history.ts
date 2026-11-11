import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeAtomicSync } from './atomicWrite'
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

export function readHistory(): HistoryEntry[] {
  try {
    const data = JSON.parse(readFileSync(historyPath(), 'utf8'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/** Never throws: the history is a convenience, the response it records is not. */
function persist(entries: HistoryEntry[]): void {
  try {
    writeAtomicSync(historyPath(), JSON.stringify(entries, null, 2))
  } catch (e) {
    logMainError('history', e)
  }
}

export function appendHistory(entry: HistoryEntry): HistoryEntry[] {
  const next = [entry, ...readHistory()].slice(0, MAX_ENTRIES)
  persist(next)
  return next
}

export function clearHistory(): void {
  persist([])
}
