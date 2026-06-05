import type { HistoryEntry } from '../../../main/history'
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
  return (
    <Modal title="History" onClose={onClose} width={640}>
      {entries.length === 0 ? (
        <div style={{ color: 'var(--text-dim)' }}>No requests sent yet.</div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button className="btn ghost" onClick={onClear}>
              Clear history
            </button>
          </div>
          {entries.map((e) => (
            <div className="hist-row" key={e.id}>
              <span className={`method-pill m-${e.method.toLowerCase()}`}>{e.method}</span>
              <span className="url">{e.url}</span>
              <span className={e.ok ? 'status-ok' : 'status-bad'} style={{ fontWeight: 700 }}>
                {e.status}
              </span>
              <span className="meta-chip">{e.timeMs} ms</span>
              <span className="meta-chip">{ago(e.at)}</span>
            </div>
          ))}
        </>
      )}
    </Modal>
  )
}
