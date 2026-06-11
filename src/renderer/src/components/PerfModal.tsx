import { useRef, useState } from 'react'
import { buildRequest } from '@core/request'
import { envToVars } from '@core/interpolate'
import { computeStats, runPool, type PerfStats } from '@core/perf'
import { resolveAuth } from '@core/collectionSettings'
import type { TigerAuth, TigerEnvironment, TigerRequest } from '@core/types'
import { Modal } from './Modal'
import { GaugeIcon } from './Icons'

interface Props {
  request: TigerRequest
  collectionAuth: TigerAuth | undefined
  env: TigerEnvironment | null
  timeoutMs: number
  onClose: () => void
}

/**
 * Fire a request many times with bounded concurrency and report latency
 * percentiles. A lightweight load/perf check, run against the live request.
 */
export function PerfModal({ request, collectionAuth, env, timeoutMs, onClose }: Props) {
  const [total, setTotal] = useState(50)
  const [concurrency, setConcurrency] = useState(10)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  const [stats, setStats] = useState<PerfStats | null>(null)
  const [statusBuckets, setStatusBuckets] = useState<Record<string, number>>({})
  const cancelled = useRef(false)

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

  return (
    <Modal title="Performance run" onClose={onClose} width={560}>
      <p style={{ margin: '0 0 16px', color: 'var(--text-dim)', fontSize: 13.5 }}>
        Sends <b>{request.method.toUpperCase()}</b> {request.url || 'this request'} repeatedly with
        bounded concurrency and reports latency percentiles.
      </p>

      <div className="row-2">
        <div className="field">
          <label>Total requests</label>
          <input
            type="number"
            min={1}
            max={2000}
            value={total}
            disabled={running}
            onChange={(e) => setTotal(Math.max(1, Math.min(2000, Number(e.target.value) || 1)))}
          />
        </div>
        <div className="field">
          <label>Concurrency</label>
          <input
            type="number"
            min={1}
            max={200}
            value={concurrency}
            disabled={running}
            onChange={(e) => setConcurrency(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
          />
        </div>
      </div>

      {!window.tiger && (
        <div className="cv-dim" style={{ marginBottom: 12 }}>
          Performance runs need the desktop app.
        </div>
      )}

      {running && (
        <div className="perf-progress">
          <div className="perf-bar">
            <div className="perf-fill" style={{ width: `${(done / total) * 100}%` }} />
          </div>
          <span className="m">
            {done} / {total}
          </span>
        </div>
      )}

      {stats && (
        <div className="perf-stats">
          <div className="perf-cell">
            <span className="n">{stats.okCount}/{stats.count}</span>
            <span className="l">2xx ok</span>
          </div>
          <div className="perf-cell">
            <span className="n">{stats.avg}</span>
            <span className="l">avg ms</span>
          </div>
          <div className="perf-cell">
            <span className="n">{stats.p50}</span>
            <span className="l">p50 ms</span>
          </div>
          <div className="perf-cell">
            <span className="n">{stats.p95}</span>
            <span className="l">p95 ms</span>
          </div>
          <div className="perf-cell">
            <span className="n">{stats.min}</span>
            <span className="l">min ms</span>
          </div>
          <div className="perf-cell">
            <span className="n">{stats.max}</span>
            <span className="l">max ms</span>
          </div>
        </div>
      )}

      {stats && Object.keys(statusBuckets).length > 0 && (
        <div className="perf-buckets">
          {Object.entries(statusBuckets).map(([bucket, n]) => (
            <span key={bucket} className={`git-chip ${bucket === '2xx' ? 'synced' : 'behind'}`}>
              {bucket}: {n}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
        {running ? (
          <button className="btn danger" onClick={() => (cancelled.current = true)}>
            Stop
          </button>
        ) : (
          <button className="btn accent" disabled={!canRun} onClick={run}>
            <GaugeIcon size={14} /> Run
          </button>
        )}
      </div>
    </Modal>
  )
}
