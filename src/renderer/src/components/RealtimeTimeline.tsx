import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { filterTimeline, type TimelineEntry, type TimelineFilter } from '@core/realtime'
import { humanSize } from '@core/response'
import { useT } from '../i18n'
import { actionLabel, actionTitle } from '../actions'
import { announce, rateLimitedAnnouncer } from '../a11y'
import { clearTimeline, onRealtimeEvents, useConnection } from '../realtime'
import { ArrowDownIcon, ArrowUpIcon, CopyIcon, EraserIcon, SearchIcon } from './Icons'
import './a11y.css'
import './Realtime.css'

interface Props {
  /** The request id: also the connection id. */
  id: string
}

/** At most one screen reader announcement per this many milliseconds. */
const ANNOUNCE_INTERVAL_MS = 1500
/** A received message is read out up to this many characters. */
const ANNOUNCE_CHARS = 140

/**
 * The live timeline of a WebSocket or SSE connection: every message sent
 * and received, with its time and size, plus connection notes. Search and a
 * direction filter narrow it. It is a log region; new messages are read out
 * politely through a rate-limited announcer, so a chatty server never floods
 * a screen reader (the list itself does not announce: aria-live="off").
 */
export function RealtimeTimeline({ id }: Props) {
  const t = useT()
  const uid = useId()
  const connection = useConnection(id)
  const [filter, setFilter] = useState<TimelineFilter>({ query: '', direction: 'all' })
  const shown = useMemo(() => filterTimeline(connection.entries, filter), [connection.entries, filter])
  const listRef = useRef<HTMLOListElement>(null)
  const stick = useRef(true)

  // Announcements: messages through the rate limiter, connection changes at once.
  const tRef = useRef(t)
  tRef.current = t
  useEffect(() => {
    const limiter = rateLimitedAnnouncer({
      intervalMs: ANNOUNCE_INTERVAL_MS,
      summarize: (count) => tRef.current('realtime.announce.more', { count })
    })
    const off = onRealtimeEvents((events) => {
      for (const ev of events) {
        if (ev.id !== id) continue
        const tr = tRef.current
        if (ev.type === 'message') {
          const text = ev.binary ? tr('realtime.entry.binary') : ev.data.slice(0, ANNOUNCE_CHARS)
          limiter.push(tr('realtime.announce.received', { text }))
        } else if (ev.type === 'open') {
          announce(tr('realtime.status.open'))
        } else if (ev.type === 'close') {
          announce(tr('realtime.status.closed'))
        } else if (ev.type === 'error') {
          announce(tr('realtime.entry.error', { message: ev.message }), { assertive: true })
        }
      }
    })
    return () => {
      off()
      limiter.dispose()
    }
  }, [id])

  // Follow the newest entry while the list is scrolled to the bottom.
  useLayoutEffect(() => {
    const el = listRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [shown])

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      announce(t('realtime.entry.copied'))
    } catch {
      /* clipboard unavailable */
    }
  }

  const describe = (e: TimelineEntry): string => {
    switch (e.type) {
      case 'connecting':
        return e.attempt ? t('realtime.entry.retrying', { url: e.url ?? '', attempt: e.attempt }) : t('realtime.entry.connecting', { url: e.url ?? '' })
      case 'open':
        return e.protocol ? t('realtime.entry.openProtocol', { protocol: e.protocol }) : t('realtime.entry.open')
      case 'close':
        if (e.code === undefined) return t('realtime.entry.close')
        return e.data ? t('realtime.entry.closeReason', { code: e.code, reason: e.data }) : t('realtime.entry.closeCode', { code: e.code })
      case 'error':
        return t('realtime.entry.error', { message: e.data })
      case 'reconnecting':
        return t('realtime.entry.reconnecting', { ms: e.delayMs ?? 0 })
      default:
        return e.data
    }
  }

  const time = (at: number): string => {
    try {
      return new Date(at).toLocaleTimeString(t.locale, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
      } as Intl.DateTimeFormatOptions)
    } catch {
      return new Date(at).toISOString().slice(11, 23)
    }
  }

  const messageCount = connection.entries.filter((e) => e.direction !== 'system').length

  return (
    <section className="panel response rt-timeline" aria-labelledby={`${uid}-title`}>
      <div className="rt-toolbar">
        <h2 className="rt-title" id={`${uid}-title`}>
          {t('realtime.timeline.label')}
        </h2>
        <span className={`rt-status-text rt-status-${connection.status}`} role="status" aria-label={t('realtime.status.label')}>
          <span className="rt-dot" aria-hidden="true" />
          {t(`realtime.status.${connection.status}`)}
        </span>
        <span className="cv-dim rt-count">{t('realtime.count', { count: messageCount })}</span>
        <div className="rt-search">
          <SearchIcon size={13} />
          <input
            type="search"
            value={filter.query}
            spellCheck={false}
            aria-label={t('realtime.filter.search')}
            placeholder={t('realtime.filter.search')}
            onChange={(e) => setFilter({ ...filter, query: e.target.value })}
          />
        </div>
        <div className="seg" role="group" aria-label={t('realtime.filter.direction')}>
          {(['all', 'sent', 'received'] as const).map((d) => (
            <button
              key={d}
              type="button"
              className={filter.direction === d ? 'on' : ''}
              aria-pressed={filter.direction === d}
              onClick={() => setFilter({ ...filter, direction: d })}
            >
              {t(`realtime.filter.${d}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label={actionLabel('clear-timeline')}
          title={actionTitle('clear-timeline')}
          onClick={() => clearTimeline(id)}
        >
          <EraserIcon size={14} />
        </button>
      </div>
      {shown.length === 0 ? (
        <div className="rt-empty cv-dim">
          {connection.entries.length ? t('realtime.timeline.noMatch') : t('realtime.timeline.empty')}
        </div>
      ) : (
        <ol
          ref={listRef}
          className="rt-list"
          role="log"
          aria-live="off"
          aria-label={t('realtime.timeline.label')}
          tabIndex={0}
          onScroll={(e) => {
            const el = e.currentTarget
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
          }}
        >
          {shown.map((e) => (
            <li key={e.seq} className={`rt-entry rt-${e.direction} rt-type-${e.type}`}>
              <span className="rt-dir" aria-hidden="true">
                {e.direction === 'sent' ? <ArrowUpIcon size={13} /> : e.direction === 'received' ? <ArrowDownIcon size={13} /> : null}
              </span>
              <span className="sr-only">
                {e.direction === 'sent' ? t('realtime.entry.sent') : e.direction === 'received' ? t('realtime.entry.received') : ''}
              </span>
              <time className="rt-time" dateTime={new Date(e.at).toISOString()}>
                {time(e.at)}
              </time>
              {e.direction === 'system' ? (
                <span className="rt-note">{describe(e)}</span>
              ) : (
                <>
                  {e.event && <span className="rt-event">{t('realtime.entry.event', { event: e.event })}</span>}
                  {e.binary && <span className="rt-event">{t('realtime.entry.binary')}</span>}
                  <pre className="rt-data">{e.data}</pre>
                  <span className="rt-size cv-dim">{humanSize(e.size)}</span>
                  <button
                    type="button"
                    className="icon-btn rt-copy"
                    aria-label={t('realtime.entry.copy')}
                    title={t('realtime.entry.copy')}
                    onClick={() => void copy(e.data)}
                  >
                    <CopyIcon size={12} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
