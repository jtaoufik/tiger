import { useCallback, useEffect, useRef, useState } from 'react'
import { runCollection, type RunnerItem, type RunnerResult } from '@core/runner'
import { envToVars } from '@core/interpolate'
import type { TigerEnvironment } from '@core/types'
import { cancelRequest, runRequest } from '../runRequest'
import { Modal } from './Modal'
import { CheckIcon, CloseIcon, PlayIcon, StopIcon } from './Icons'
import './RunnerModal.css'

interface Props {
  title: string
  /** Loads every request in scope, auth inheritance already applied. */
  loadItems: () => Promise<RunnerItem[]>
  environment: TigerEnvironment | null
  timeoutMs: number
  onClose: () => void
}

type Phase = 'loading' | 'ready' | 'running' | 'done'

/** Cancel key shared by all runner sends so Stop also aborts the in-flight one. */
const RUNNER_KEY = 'collection-runner'

export function RunnerModal({ title, loadItems, environment, timeoutMs, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [items, setItems] = useState<RunnerItem[]>([])
  const [results, setResults] = useState<RunnerResult[]>([])
  const [summary, setSummary] = useState<{ passed: number; failed: number; stopped: boolean } | null>(null)
  const stopRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    loadItems()
      .then((loaded) => {
        if (!cancelled) {
          setItems(loaded)
          setPhase('ready')
        }
      })
      .catch(() => {
        if (!cancelled) setPhase('ready')
      })
    return () => {
      cancelled = true
    }
  }, [loadItems])

  const start = useCallback(async () => {
    stopRef.current = false
    setResults([])
    setSummary(null)
    setPhase('running')

    const outcome = await runCollection(items, {
      vars: envToVars(environment),
      execute: async (request, vars) => {
        const env: TigerEnvironment = {
          name: 'runner',
          variables: Object.entries(vars).map(([name, value]) => ({ name, value, enabled: true }))
        }
        // Scripts/captures are applied by the runner itself; send the bare request.
        const bare = { ...request, preScript: undefined, postScript: undefined, captures: undefined }
        const data = await runRequest(bare, env, timeoutMs, RUNNER_KEY)
        return { status: data.status, headers: data.headers, body: data.raw, timeMs: data.timeMs }
      },
      onResult: (result) => setResults((prev) => [...prev, result]),
      shouldStop: () => stopRef.current
    })

    setSummary({ passed: outcome.passed, failed: outcome.failed, stopped: outcome.stopped })
    setPhase('done')
  }, [items, environment, timeoutMs])

  const stop = useCallback(() => {
    stopRef.current = true
    cancelRequest(RUNNER_KEY)
  }, [])

  return (
    <Modal title={`Run · ${title}`} onClose={onClose} width={620}>
      {phase === 'loading' && <div className="cv-dim">Loading requests…</div>}

      {phase !== 'loading' && items.length === 0 && (
        <div className="cv-dim">Nothing to run yet: this scope has no requests. Add one from the sidebar, then run again.</div>
      )}

      {phase !== 'loading' && items.length > 0 && (
        <>
          <div className="runner-toolbar">
            {phase === 'running' ? (
              <button className="btn" onClick={stop}>
                <StopIcon size={13} /> Stop
              </button>
            ) : (
              <button className="btn accent" onClick={start}>
                <PlayIcon size={13} /> {phase === 'done' ? 'Run again' : `Run ${items.length} request${items.length === 1 ? '' : 's'}`}
              </button>
            )}
            {phase === 'running' && (
              <span className="cv-dim">
                {results.length} / {items.length}
              </span>
            )}
            {summary && (
              <span className={`runner-summary ${summary.failed ? 'bad' : 'good'}`}>
                {summary.passed} passed · {summary.failed} failed
                {summary.stopped ? ' · stopped' : ''}
              </span>
            )}
          </div>

          <div className="runner-list">
            {items.map((item, i) => {
              const r = results[i]
              const running = phase === 'running' && i === results.length
              return (
                <div key={item.id} className={`runner-row ${r ? (r.passed ? 'pass' : 'fail') : ''}`}>
                  <span className={`method-pill m-${item.request.method}`}>
                    {item.request.method.toUpperCase()}
                  </span>
                  <span className="runner-name">{item.name}</span>
                  {running && <span className="cv-dim">sending…</span>}
                  {r && (
                    <>
                      {r.status !== undefined && (
                        <span className={r.status < 400 ? 'status-ok' : 'status-bad'}>{r.status}</span>
                      )}
                      {r.timeMs !== undefined && <span className="meta-chip">{r.timeMs} ms</span>}
                      {r.tests.length > 0 && (
                        <span className="meta-chip">
                          tests {r.tests.filter((t) => t.passed).length}/{r.tests.length}
                        </span>
                      )}
                      {r.error && <span className="runner-error" title={r.error}>{r.error}</span>}
                      {r.passed ? (
                        <CheckIcon size={14} className="runner-verdict ok" />
                      ) : (
                        <CloseIcon size={14} className="runner-verdict bad" />
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </Modal>
  )
}
