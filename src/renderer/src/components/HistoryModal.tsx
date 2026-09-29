import { useEffect, useMemo, useRef, useState } from 'react'
import type { HistoryEntry } from '../../../main/history'
import { CheckIcon, ClockIcon, CopyIcon, TrashIcon, XCircleIcon } from './Icons'
import './a11y.css'
import './HistoryModal.css'
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
  const keepRef = useRef<HTMLButtonElement>(null)
  const clearRef = useRef<HTMLButtonElement>(null)
  const wasConfirming = useRef(false)
  // The buttons swap in place; keep focus on the safe choice each way so it
  // never falls back to the document.
  useEffect(() => {
    if (confirmClear) keepRef.current?.focus()
    else if (wasConfirming.current) clearRef.current?.focus()
    wasConfirming.current = confirmClear
  }, [confirmClear])

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
    <Modal title="History" onClose={onClose} width={700}>
      <div className="hist-toolbar hist-bar">
        <div className="seg" role="group" aria-label="History scope">
          <button
            type="button"
            className={scope === 'request' ? 'on' : ''}
            aria-pressed={scope === 'request'}
            disabled={!activeRequestId}
            onClick={() => setScope('request')}
            title={activeRequestName ? `History for "${activeRequestName}"` : 'No request open'}
          >
            This request
          </button>
          <button
            type="button"
            className={scope === 'collection' ? 'on' : ''}
            aria-pressed={scope === 'collection'}
            onClick={() => setScope('collection')}
            title={collectionName ?? undefined}
          >
            {collectionName ? `Collection: ${collectionName}` : 'This collection'}
          </button>
        </div>
        <div className="field hist-filter">
          <input
            type="search"
            placeholder="Filter: /users, POST, 404…"
            value={filter}
            spellCheck={false}
            onChange={(ev) => setFilter(ev.target.value)}
            aria-label="Filter history by URL or method"
          />
        </div>
        {confirmClear ? (
          <span className="hist-confirm" role="group" aria-label="Clear all history?">
            {/* Same two-step confirm as Git discard: wiping history is irreversible. */}
            <button type="button" className="btn ghost" ref={keepRef} onClick={() => setConfirmClear(false)}>
              Keep
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                setConfirmClear(false)
                onClear()
              }}
            >
              Clear everything
            </button>
          </span>
        ) : (
          <button
            type="button"
            ref={clearRef}
            className="btn ghost"
            onClick={() => setConfirmClear(true)}
            title="Clear all history"
            disabled={entries.length === 0}
          >
            <TrashIcon size={13} /> Clear
          </button>
        )}
      </div>

      <div className="tg-sr-only" role="status" aria-live="polite">
        {q ? `${visible.length} matching send${visible.length === 1 ? '' : 's'}` : ''}
        {copiedId ? ' URL copied to clipboard' : ''}
      </div>

      {visible.length === 0 ? (
        <div className="modal-empty">
          <ClockIcon size={28} />
          <h3>{q ? 'No matches' : 'Nothing sent yet'}</h3>
          <p>
            {q
              ? `No send in this ${scope} matches "${filter.trim()}".`
              : scope === 'request'
                ? 'No sends recorded for this request yet. Hit Send and it shows up here.'
                : 'No sends recorded in this collection yet.'}
          </p>
          {q ? (
            <button type="button" className="btn" onClick={() => setFilter('')}>
              Clear filter
            </button>
          ) : scope === 'request' ? (
            <button type="button" className="btn" onClick={() => setScope('collection')}>
              Show the whole collection
            </button>
          ) : (
            <button type="button" className="btn" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      ) : (
        <ul className="hist-list" aria-label={`${visible.length} send${visible.length === 1 ? '' : 's'}`}>
          {visible.map((e) => (
            <li className="hist-row" key={e.id}>
              <span className={`method-pill m-${e.method.toLowerCase()}`}>{e.method}</span>
              <span className="url" title={e.url}>
                {e.url}
              </span>
              <span className={`hist-status ${e.ok ? 'ok' : 'bad'}`} title={e.ok ? 'Succeeded' : 'Failed'}>
                {e.ok ? <CheckIcon size={12} aria-hidden="true" /> : <XCircleIcon size={12} aria-hidden="true" />}
                {e.status}
                <span className="tg-sr-only">{e.ok ? ' ok' : ' failed'}</span>
              </span>
              <span className="meta-chip">{e.timeMs} ms</span>
              <span className="meta-chip" title={new Date(e.at).toLocaleString()}>
                {ago(e.at)}
              </span>
              <button
                type="button"
                className="icon-btn"
                title="Copy URL"
                aria-label={copiedId === e.id ? 'URL copied' : `Copy URL ${e.url}`}
                onClick={() => copyUrl(e)}
              >
                {copiedId === e.id ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
