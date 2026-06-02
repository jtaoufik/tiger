import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface HistoryEntry {
  id: string
  at: number
  method: string
  url: string
  status: number
  ok: boolean
  timeMs: number
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

export function appendHistory(entry: HistoryEntry): HistoryEntry[] {
  const next = [entry, ...readHistory()].slice(0, MAX_ENTRIES)
  writeFileSync(historyPath(), JSON.stringify(next, null, 2), 'utf8')
  return next
}

export function clearHistory(): void {
  writeFileSync(historyPath(), '[]', 'utf8')
}
