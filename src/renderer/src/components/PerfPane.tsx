import { useId, useRef, useState } from 'react'
import { buildRequest } from '@core/request'
import { envToVars } from '@core/interpolate'
import { computeStats, runPool, type PerfStats } from '@core/perf'
import { resolveAuth } from '@core/collectionSettings'
import type { TigerAuth, TigerEnvironment, TigerRequest } from '@core/types'
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
 * Performance tab: fire the request many times with bounded concurrency and
 * report latency percentiles. A lightweight load check on the live request.
 */
export function PerfPane({ request, collectionAuth, env, timeoutMs }: Props) {
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
    ? `${done} of ${total} sent`
    : stats
      ? `Done: ${stats.okCount} of ${stats.count} returned 2xx, p50 ${stats.p50} ms, p95 ${stats.p95} ms`
      : ''
  const cells: Array<[string, string | number, string]> = stats
    ? [
        ['2xx ok', `${stats.okCount}/${stats.count}`, `${stats.okCount} of ${stats.count} responses were 2xx`],
        ['avg ms', stats.avg, `average ${stats.avg} milliseconds`],
        ['p50 ms', stats.p50, `median ${stats.p50} milliseconds`],
        ['p95 ms', stats.p95, `95th percentile ${stats.p95} milliseconds`],
        ['min ms', stats.min, `fastest ${stats.min} milliseconds`],
        ['max ms', stats.max, `slowest ${stats.max} milliseconds`]
      ]
    : []

  return (
    <div className="perf-pane">
      <p className="perf-lead">
        Sends <b>{request.method.toUpperCase()}</b>{' '}
        <span className="perf-url" title={request.url}>
          {request.url || 'this request'}
        </span>{' '}
        repeatedly with bounded concurrency and reports latency percentiles.
      </p>

      <div className="row-2">
        <div className="field">
          <label htmlFor={`${uid}-total`}>Total requests</label>
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
            1 to 2000
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${uid}-conc`}>Concurrency</label>
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
            Requests in flight at once, 1 to 200
          </div>
        </div>
      </div>

      {!window.tiger && (
        <div className="cv-dim perf-note" role="note">
          Performance runs need the desktop app.
        </div>
      )}

      {running && (
        <div className="perf-progress">
          <div
            className="perf-bar"
            role="progressbar"
            aria-label="Performance run progress"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            aria-valuetext={`${done} of ${total} sent`}
          >
            <div className="perf-fill" style={{ width: `${(done / total) * 100}%` }} />
          </div>
          <span className="m" aria-hidden="true">
            {done} / {total}
          </span>
        </div>
      )}
      <div className="tg-sr-only" role="status" aria-live="polite">
        {statusText}
      </div>

      {stats && (
        <dl className="perf-stats" aria-label="Latency results">
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
        <ul className="perf-buckets" aria-label="Responses by status class">
          {Object.entries(statusBuckets).map(([bucket, n]) => (
            <li key={bucket} className={`git-chip ${bucket === '2xx' ? 'synced' : 'behind'}`}>
              {bucket === 'error' ? 'errors' : bucket}: {n}
            </li>
          ))}
        </ul>
      )}

      <div className="perf-actions">
        {running ? (
          <button type="button" className="btn danger" onClick={() => (cancelled.current = true)}>
            Stop
          </button>
        ) : (
          <button type="button" className="btn accent" disabled={!canRun} onClick={run}>
            <GaugeIcon size={14} /> Run {total} request{total === 1 ? '' : 's'}
          </button>
        )}
      </div>
    </div>
  )
}
