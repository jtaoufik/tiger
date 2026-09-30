import { useEffect, useMemo, useRef, useState } from 'react'
import type { HistoryEntry } from '../../../main/history'
import { CheckIcon, ClockIcon, CopyIcon, TrashIcon, XCircleIcon } from './Icons'
import './a11y.css'
import './HistoryModal.css'
import { Modal } from './Modal'
import { useT } from '../i18n'
import type { Translator } from '@core/i18n'

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

function ago(at: number, t: Translator): string {
  const secs = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (secs < 60) return t.relativeTime(-secs, 'second')
  const mins = Math.round(secs / 60)
  if (mins < 60) return t.relativeTime(-mins, 'minute')
  const hours = Math.round(mins / 60)
  if (hours < 24) return t.relativeTime(-hours, 'hour')
  return t.relativeTime(-Math.round(hours / 24), 'day')
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
  const t = useT()
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
    <Modal title={t('modals.history.title')} onClose={onClose} width={700}>
      <div className="hist-toolbar hist-bar">
        <div className="seg" role="group" aria-label={t('modals.history.scope')}>
          <button
            type="button"
            className={scope === 'request' ? 'on' : ''}
            aria-pressed={scope === 'request'}
            disabled={!activeRequestId}
            onClick={() => setScope('request')}
            title={
              activeRequestName
                ? t('modals.history.requestTitle', { name: activeRequestName })
                : t('modals.history.noRequest')
            }
          >
            {t('modals.history.thisRequest')}
          </button>
          <button
            type="button"
            className={scope === 'collection' ? 'on' : ''}
            aria-pressed={scope === 'collection'}
            onClick={() => setScope('collection')}
            title={collectionName ?? undefined}
          >
            {collectionName
              ? t('modals.history.collectionNamed', { name: collectionName })
              : t('modals.history.thisCollection')}
          </button>
        </div>
        <div className="field hist-filter">
          <input
            type="search"
            placeholder={t('modals.history.filterPlaceholder')}
            value={filter}
            spellCheck={false}
            onChange={(ev) => setFilter(ev.target.value)}
            aria-label={t('modals.history.filterLabel')}
          />
        </div>
        {confirmClear ? (
          <span className="hist-confirm" role="group" aria-label={t('modals.history.clearAsk')}>
            {/* Same two-step confirm as Git discard: wiping history is irreversible. */}
            <button type="button" className="btn ghost" ref={keepRef} onClick={() => setConfirmClear(false)}>
              {t('modals.history.keep')}
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                setConfirmClear(false)
                onClear()
              }}
            >
              {t('modals.history.clearEverything')}
            </button>
          </span>
        ) : (
          <button
            type="button"
            ref={clearRef}
            className="btn ghost"
            onClick={() => setConfirmClear(true)}
            title={t('modals.history.clearTitle')}
            disabled={entries.length === 0}
          >
            <TrashIcon size={13} /> {t('common.clear')}
          </button>
        )}
      </div>

      <div className="tg-sr-only" role="status" aria-live="polite">
        {q ? t('modals.history.matching', { count: visible.length }) : ''}
        {copiedId ? ` ${t('modals.history.copiedAnnounce')}` : ''}
      </div>

      {visible.length === 0 ? (
        <div className="modal-empty">
          <ClockIcon size={28} />
          <h3>{q ? t('modals.history.noMatches') : t('modals.history.nothingSent')}</h3>
          <p>
            {q
              ? t(scope === 'request' ? 'modals.history.noMatchRequest' : 'modals.history.noMatchCollection', {
                  filter: filter.trim()
                })
              : scope === 'request'
                ? t('modals.history.emptyRequest')
                : t('modals.history.emptyCollection')}
          </p>
          {q ? (
            <button type="button" className="btn" onClick={() => setFilter('')}>
              {t('modals.history.clearFilter')}
            </button>
          ) : scope === 'request' ? (
            <button type="button" className="btn" onClick={() => setScope('collection')}>
              {t('modals.history.showCollection')}
            </button>
          ) : (
            <button type="button" className="btn" onClick={onClose}>
              {t('common.close')}
            </button>
          )}
        </div>
      ) : (
        <ul className="hist-list" aria-label={t('modals.history.sends', { count: visible.length })}>
          {visible.map((e) => (
            <li className="hist-row" key={e.id}>
              <span className={`method-pill m-${e.method.toLowerCase()}`}>{e.method}</span>
              <span className="url" title={e.url}>
                {e.url}
              </span>
              <span className={`hist-status ${e.ok ? 'ok' : 'bad'}`} title={e.ok ? t('modals.history.succeeded') : t('modals.history.failed')}>
                {e.ok ? <CheckIcon size={12} aria-hidden="true" /> : <XCircleIcon size={12} aria-hidden="true" />}
                {e.status}
                <span className="tg-sr-only"> {e.ok ? t('modals.history.srOk') : t('modals.history.srFailed')}</span>
              </span>
              <span className="meta-chip">{t('common.ms', { value: e.timeMs })}</span>
              <span className="meta-chip" title={t.date(e.at, { dateStyle: 'medium', timeStyle: 'medium' })}>
                {ago(e.at, t)}
              </span>
              <button
                type="button"
                className="icon-btn"
                title={t('modals.history.copyUrl')}
                aria-label={
                  copiedId === e.id
                    ? t('modals.history.urlCopied')
                    : t('modals.history.copyUrlLabel', { url: e.url })
                }
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
