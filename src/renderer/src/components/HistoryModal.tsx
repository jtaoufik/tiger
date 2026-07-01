import { useMemo, useState } from 'react'
import type { HistoryEntry } from '../../../main/history'
import { CheckIcon, CopyIcon } from './Icons'
import { Modal } from './Modal'

interface Props {
  entries: HistoryEntry[]
  /** Entry id of the currently open request, for the per-request scope. */
  activeRequestId: string | null
  activeRequestName: string | null
  /** Entry ids belonging to the active collection, for the per-collection scope. */
  collectionEntryIds: string[]
  collectionName: string | null
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

export function HistoryModal({
  entries,
  activeRequestId,
  activeRequestName,
  collectionEntryIds,
  collectionName,
  onClear,
  onClose
}: Props) {
  const [scope, setScope] = useState<'request' | 'collection'>(
    activeRequestId ? 'request' : 'collection'
  )
  const [filter, setFilter] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const idSet = useMemo(() => new Set(collectionEntryIds), [collectionEntryIds])

  const scoped = useMemo(() => {
    if (scope === 'request') {
      return activeRequestId ? entries.filter((e) => e.requestId === activeRequestId) : []
    }
    return entries.filter((e) => e.requestId && idSet.has(e.requestId))
  }, [entries, scope, activeRequestId, idSet])

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
    ? scoped.filter((e) => e.url.toLowerCase().includes(q) || e.method.toLowerCase().includes(q))
    : scoped

  return (
    <Modal title="History" onClose={onClose} width={660}>
      <div className="hist-toolbar">
        <div className="seg">
          <button
            className={scope === 'request' ? 'on' : ''}
            disabled={!activeRequestId}
            onClick={() => setScope('request')}
            title={activeRequestName ? `History for "${activeRequestName}"` : 'No request open'}
          >
            This request
          </button>
          <button className={scope === 'collection' ? 'on' : ''} onClick={() => setScope('collection')}>
            {collectionName ? `Collection: ${collectionName}` : 'This collection'}
          </button>
        </div>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <input
            type="text"
            placeholder="Filter by URL or method"
            value={filter}
            onChange={(ev) => setFilter(ev.target.value)}
            aria-label="Filter history"
          />
        </div>
        {confirmClear ? (
          <>
            {/* Same two-step confirm as Git discard: wiping history is irreversible. */}
            <button
              className="btn danger"
              onClick={() => {
                setConfirmClear(false)
                onClear()
              }}
            >
              Clear everything
            </button>
            <button className="btn ghost" onClick={() => setConfirmClear(false)}>
              Keep
            </button>
          </>
        ) : (
          <button className="btn ghost" onClick={() => setConfirmClear(true)} title="Clear all history">
            Clear
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', padding: '8px 2px' }}>
          {scope === 'request'
            ? 'No sends recorded for this request yet.'
            : 'No sends recorded in this collection yet.'}
        </div>
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
    </Modal>
  )
}
