import { useId, useRef, useState } from 'react'
import { buildRequest } from '@core/request'
import { envToVars } from '@core/interpolate'
import { computeStats, runPool, type PerfStats } from '@core/perf'
import { resolveAuth } from '@core/collectionSettings'
import type { TigerAuth, TigerEnvironment, TigerRequest } from '@core/types'
import { useT } from '../i18n'
import { GaugeIcon } from './Icons'
import './a11y.css'
import './PerfPane.css'

interface Props {
  request: TigerRequest
  collectionAuth: TigerAuth | undefined
  env: TigerEnvironment | null
  timeoutMs: number
}

/**
 * Load test tab: fire the request many times with bounded concurrency and
 * report latency percentiles. A lightweight load check on the live request.
 */
export function PerfPane({ request, collectionAuth, env, timeoutMs }: Props) {
  const t = useT()
  const [total, setTotal] = useState(50)
  const [concurrency, setConcurrency] = useState(10)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  const [stats, setStats] = useState<PerfStats | null>(null)
  const [statusBuckets, setStatusBuckets] = useState<Record<string, number>>({})
  const cancelled = useRef(false)
  const uid = useId()

  const run = async () => {
    setRunning(true)
    setStats(null)
    setDone(0)
    setStatusBuckets({})
    cancelled.current = false

    const effective = { ...request, auth: resolveAuth(request, collectionAuth) }
    const built = buildRequest(effective, envToVars(env))
    const times: number[] = []
    const buckets: Record<string, number> = {}
    let okCount = 0

    await runPool(
      total,
      concurrency,
      async () => {
        if (cancelled.current) return
        try {
          const res = await window.tiger!.send(built, timeoutMs)
          times.push(res.timeMs)
          const bucket = `${Math.floor(res.status / 100)}xx`
          buckets[bucket] = (buckets[bucket] ?? 0) + 1
          if (res.status >= 200 && res.status < 300) okCount++
        } catch {
          buckets.error = (buckets.error ?? 0) + 1
        }
      },
      (d) => setDone(d)
    )

    setStatusBuckets(buckets)
    setStats(computeStats(times, okCount))
    setRunning(false)
  }

  const canRun = !!window.tiger && !running
  const statusText = running
    ? t('request.perf.sent', { done, total })
    : stats
      ? t('request.perf.statusDone', {
          ok: stats.okCount,
          count: stats.count,
          p50: t.number(stats.p50),
          p95: t.number(stats.p95)
        })
      : ''
  const cells: Array<[string, string | number, string]> = stats
    ? [
        [
          t('request.perf.cellOk'),
          `${t.number(stats.okCount)}/${t.number(stats.count)}`,
          t('request.perf.spokenOk', { ok: stats.okCount, count: stats.count })
        ],
        [t('request.perf.cellAvg'), t.number(stats.avg), t('request.perf.spokenAvg', { value: t.number(stats.avg) })],
        [t('request.perf.cellP50'), t.number(stats.p50), t('request.perf.spokenP50', { value: t.number(stats.p50) })],
        [t('request.perf.cellP95'), t.number(stats.p95), t('request.perf.spokenP95', { value: t.number(stats.p95) })],
        [t('request.perf.cellMin'), t.number(stats.min), t('request.perf.spokenMin', { value: t.number(stats.min) })],
        [t('request.perf.cellMax'), t.number(stats.max), t('request.perf.spokenMax', { value: t.number(stats.max) })]
      ]
    : []

  // The sentence is one message; the method and URL are spliced in at {request}.
  const [leadBefore, leadAfter = ''] = t('request.perf.lead', { request: '\u0001' }).split('\u0001')

  return (
    <div className="perf-pane">
      <p className="perf-lead">
        {leadBefore}
        <b>{request.method.toUpperCase()}</b>{' '}
        <span className="perf-url" title={request.url}>
          {request.url || t('request.perf.thisRequest')}
        </span>
        {leadAfter}
      </p>

      <div className="row-2">
        <div className="field">
          <label htmlFor={`${uid}-total`}>{t('request.perf.total')}</label>
          <input
            id={`${uid}-total`}
            type="number"
            min={1}
            max={2000}
            value={total}
            disabled={running}
            aria-describedby={`${uid}-total-hint`}
            onChange={(e) => setTotal(Math.max(1, Math.min(2000, Number(e.target.value) || 1)))}
          />
          <div id={`${uid}-total-hint`} className="perf-hint">
            {t('request.perf.totalHint')}
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${uid}-conc`}>{t('request.perf.concurrency')}</label>
          <input
            id={`${uid}-conc`}
            type="number"
            min={1}
            max={200}
            value={concurrency}
            disabled={running}
            aria-describedby={`${uid}-conc-hint`}
            onChange={(e) => setConcurrency(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
          />
          <div id={`${uid}-conc-hint`} className="perf-hint">
            {t('request.perf.concurrencyHint')}
          </div>
        </div>
      </div>

      {!window.tiger && (
        <div className="cv-dim perf-note" role="note">
          {t('request.perf.needsDesktop')}
        </div>
      )}

      {running && (
        <div className="perf-progress">
          <div
            className="perf-bar"
            role="progressbar"
            aria-label={t('request.perf.progress')}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            aria-valuetext={t('request.perf.sent', { done, total })}
          >
            <div className="perf-fill" style={{ width: `${(done / total) * 100}%` }} />
          </div>
          <span className="m" aria-hidden="true">
            {t('request.perf.progressText', { done, total })}
          </span>
        </div>
      )}
      <div className="tg-sr-only" role="status" aria-live="polite">
        {statusText}
      </div>

      {stats && (
        <dl className="perf-stats" aria-label={t('request.perf.results')}>
          {cells.map(([label, value, spoken]) => (
            <div className="perf-cell" key={label}>
              <dt className="l">{label}</dt>
              <dd className="n" aria-label={spoken}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {stats && Object.keys(statusBuckets).length > 0 && (
        <ul className="perf-buckets" aria-label={t('request.perf.buckets')}>
          {Object.entries(statusBuckets).map(([bucket, n]) => (
            <li key={bucket} className={`git-chip ${bucket === '2xx' ? 'synced' : 'behind'}`}>
              {t('request.perf.bucket', {
                bucket: bucket === 'error' ? t('request.perf.errors') : bucket,
                n
              })}
            </li>
          ))}
        </ul>
      )}

      <div className="perf-actions">
        {running ? (
          <button type="button" className="btn danger" onClick={() => (cancelled.current = true)}>
            {t('request.perf.stop')}
          </button>
        ) : (
          <button type="button" className="btn accent" disabled={!canRun} onClick={run}>
            <GaugeIcon size={14} /> {t('request.perf.run', { count: total })}
          </button>
        )}
      </div>
    </div>
  )
}
