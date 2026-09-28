import { useCallback, useEffect, useRef, useState } from 'react'
import { runCollection, type RunnerItem, type RunnerResult } from '@core/runner'
import { envToVars } from '@core/interpolate'
import type { TigerEnvironment } from '@core/types'
import { cancelRequest, runRequest } from '../runRequest'
import { Modal } from './Modal'
import { CheckIcon, PlayIcon, StopIcon, XCircleIcon } from './Icons'
import './a11y.css'
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

  const done = results.length
  const failed = results.filter((r) => !r.passed).length
  const progressText =
    phase === 'running'
      ? `${done} of ${items.length} done${failed ? `, ${failed} failed` : ''}`
      : summary
        ? `Finished${summary.stopped ? ' (stopped)' : ''}: ${summary.passed} passed, ${summary.failed} failed`
        : ''

  return (
    <Modal
      title={`Run · ${title}`}
      onClose={onClose}
      width={680}
      description={
        phase !== 'loading' && items.length > 0
          ? 'Sends every request in order, applying captures and scripts between them.'
          : undefined
      }
      footer={
        phase !== 'loading' && items.length > 0 ? (
          <>
            <button type="button" className="btn" onClick={onClose}>
              Close
            </button>
            {phase === 'running' ? (
              <button type="button" className="btn danger" onClick={stop}>
                <StopIcon size={13} /> Stop
              </button>
            ) : (
              <button type="button" className="btn accent" data-autofocus onClick={start}>
                <PlayIcon size={13} />{' '}
                {phase === 'done'
                  ? 'Run again'
                  : `Run ${items.length} request${items.length === 1 ? '' : 's'}`}
              </button>
            )}
          </>
        ) : undefined
      }
    >
      {phase === 'loading' && (
        <div className="cv-dim" role="status">
          Loading requests…
        </div>
      )}

      {phase !== 'loading' && items.length === 0 && (
        <div className="modal-empty">
          <PlayIcon size={28} />
          <h3>Nothing to run yet</h3>
          <p>This scope has no requests. Add one from the sidebar, then run again.</p>
          <button type="button" className="btn" data-autofocus onClick={onClose}>
            Close
          </button>
        </div>
      )}

      {phase !== 'loading' && items.length > 0 && (
        <>
          {(phase === 'running' || summary) && (
            <div className="runner-progress">
              <div
                className="runner-bar"
                role="progressbar"
                aria-label="Run progress"
                aria-valuemin={0}
                aria-valuemax={items.length}
                aria-valuenow={done}
                aria-valuetext={progressText}
              >
                <div
                  className={`runner-fill ${failed ? 'has-fail' : ''}`}
                  style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }}
                />
              </div>
              {summary ? (
                <span className={`runner-summary ${summary.failed ? 'bad' : 'good'}`}>
                  {summary.failed ? (
                    <XCircleIcon size={14} aria-hidden="true" />
                  ) : (
                    <CheckIcon size={14} aria-hidden="true" />
                  )}
                  {summary.passed} passed · {summary.failed} failed
                  {summary.stopped ? ' · stopped' : ''}
                </span>
              ) : (
                <span className="cv-dim runner-count">
                  {done} / {items.length}
                </span>
              )}
            </div>
          )}
          <div className="tg-sr-only" role="status" aria-live="polite">
            {progressText}
          </div>

          <div className="runner-list">
            <table className="runner-table">
              <caption className="tg-sr-only">Requests in this run and their results</caption>
              <thead>
                <tr>
                  <th scope="col">Method</th>
                  <th scope="col">Request</th>
                  <th scope="col">Status</th>
                  <th scope="col">Time</th>
                  <th scope="col">Tests</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => {
                  const r = results[i]
                  const running = phase === 'running' && i === results.length
                  return (
                    <tr
                      key={item.id}
                      className={`runner-row ${r ? (r.passed ? 'pass' : 'fail') : ''}`}
                      aria-current={running ? 'step' : undefined}
                    >
                      <td>
                        <span className={`method-pill m-${item.request.method}`}>
                          {item.request.method.toUpperCase()}
                        </span>
                      </td>
                      <th scope="row" className="runner-name" title={item.name}>
                        {item.name}
                        {r?.error && (
                          <span className="runner-error" title={r.error}>
                            {r.error}
                          </span>
                        )}
                      </th>
                      <td>
                        {r?.status !== undefined ? (
                          <span className={r.status < 400 ? 'runner-ok' : 'runner-bad'}>{r.status}</span>
                        ) : (
                          <span className="runner-na">{running ? 'sending…' : ''}</span>
                        )}
                      </td>
                      <td className="runner-num">{r?.timeMs !== undefined ? `${r.timeMs} ms` : ''}</td>
                      <td className="runner-num">
                        {r && r.tests.length > 0
                          ? `${r.tests.filter((t) => t.passed).length}/${r.tests.length}`
                          : ''}
                      </td>
                      <td>
                        {r ? (
                          r.passed ? (
                            <span className="runner-verdict ok">
                              <CheckIcon size={14} aria-hidden="true" /> Pass
                            </span>
                          ) : (
                            <span className="runner-verdict bad">
                              <XCircleIcon size={14} aria-hidden="true" /> Fail
                            </span>
                          )
                        ) : (
                          <span className="runner-na">{running ? 'Running' : 'Pending'}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  )
}
