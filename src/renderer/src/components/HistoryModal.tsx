import { useState } from 'react'
import type { HistoryEntry } from '../../../main/history'
import { CheckIcon, CopyIcon } from './Icons'
import { Modal } from './Modal'

interface Props {
  entries: HistoryEntry[]
  onClear: () => void
  onClose: () => void
}

function ago(at: number): string {
  const secs = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (secs < 60) return `${secs}s ago`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export function HistoryModal({ entries, onClear, onClose }: Props) {
  const [filter, setFilter] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const copyUrl = async (entry: HistoryEntry) => {
    try {
      await navigator.clipboard.writeText(entry.url)
      setCopiedId(entry.id)
      setTimeout(() => setCopiedId((cur) => (cur === entry.id ? null : cur)), 1200)
    } catch {
      /* clipboard unavailable */
    }
  }

  const q = filter.trim().toLowerCase()
  const visible = q
    ? entries.filter(
        (e) => e.url.toLowerCase().includes(q) || e.method.toLowerCase().includes(q)
      )
    : entries

  return (
    <Modal title="History" onClose={onClose} width={640}>
      {entries.length === 0 ? (
        <div style={{ color: 'var(--text-dim)' }}>No requests sent yet.</div>
      ) : (
        <>
          <div className="hist-toolbar">
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <input
                type="text"
                placeholder="Filter by URL or method"
                value={filter}
                onChange={(ev) => setFilter(ev.target.value)}
                aria-label="Filter history"
              />
            </div>
            <button className="btn ghost" onClick={onClear}>
              Clear history
            </button>
          </div>
          {visible.length === 0 ? (
            <div style={{ color: 'var(--text-dim)' }}>No entries match this filter.</div>
          ) : (
            visible.map((e) => (
              <div className="hist-row" key={e.id}>
                <span className={`method-pill m-${e.method.toLowerCase()}`}>{e.method}</span>
                <span className="url">{e.url}</span>
                <span className={e.ok ? 'status-ok' : 'status-bad'} style={{ fontWeight: 700 }}>
                  {e.status}
                </span>
                <span className="meta-chip">{e.timeMs} ms</span>
                <span className="meta-chip">{ago(e.at)}</span>
                <button className="icon-btn" title="Copy URL" onClick={() => copyUrl(e)}>
                  {copiedId === e.id ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                </button>
              </div>
            ))
          )}
        </>
      )}
    </Modal>
  )
}
