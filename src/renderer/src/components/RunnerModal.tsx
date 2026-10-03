import { useCallback, useEffect, useRef, useState } from 'react'
import { runCollection, type RunnerItem, type RunnerResult } from '@core/runner'
import { envToVars } from '@core/interpolate'
import type { TigerEnvironment } from '@core/types'
import { cancelRequest, runRequest } from '../runRequest'
import { runScriptIsolated } from '../scriptSandbox'
import { Modal } from './Modal'
import { useT } from '../i18n'
import { CheckIcon, PlayIcon, StopIcon, XCircleIcon } from './Icons'
import './a11y.css'
import './RunnerModal.css'

interface Props {
  title: string
  /** Loads every request in scope, auth inheritance already applied. */
  loadItems: () => Promise<RunnerItem[]>
  environment: TigerEnvironment | null
  /** The collection folder: relative file rows are read from it. */
  baseDir?: string
  /**
   * Variables the run's scripts and captures changed, saved to the
   * environment when the run ends (Postman keeps them too).
   */
  onVariablesChanged?: (changed: Array<{ name: string; value: string }>) => void
  timeoutMs: number
  onClose: () => void
}

type Phase = 'loading' | 'ready' | 'running' | 'done'

/** Cancel key shared by all runner sends so Stop also aborts the in-flight one. */
const RUNNER_KEY = 'collection-runner'

export function RunnerModal({
  title,
  loadItems,
  environment,
  baseDir,
  onVariablesChanged,
  timeoutMs,
  onClose
}: Props) {
  const t = useT()
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

    const initial = envToVars(environment)
    const outcome = await runCollection(items, {
      vars: initial,
      execute: async (request, vars) => {
        const env: TigerEnvironment = {
          name: 'runner',
          variables: Object.entries(vars).map(([name, value]) => ({ name, value, enabled: true }))
        }
        // Scripts/captures are applied by the runner itself; send the bare request.
        const bare = { ...request, preScript: undefined, postScript: undefined, captures: undefined }
        const data = await runRequest(bare, env, timeoutMs, RUNNER_KEY, baseDir)
        return { status: data.status, headers: data.headers, body: data.raw, timeMs: data.timeMs }
      },
      runScript: runScriptIsolated,
      onResult: (result) => setResults((prev) => [...prev, result]),
      shouldStop: () => stopRef.current
    })

    const changed = Object.entries(outcome.vars)
      .filter(([name, value]) => initial[name] !== value)
      .map(([name, value]) => ({ name, value }))
    if (changed.length) onVariablesChanged?.(changed)

    setSummary({ passed: outcome.passed, failed: outcome.failed, stopped: outcome.stopped })
    setPhase('done')
  }, [items, environment, timeoutMs, baseDir, onVariablesChanged])

  const stop = useCallback(() => {
    stopRef.current = true
    cancelRequest(RUNNER_KEY)
  }, [])

  const done = results.length
  const failed = results.filter((r) => !r.passed).length
  const progressText =
    phase === 'running'
      ? t(failed ? 'modals.runner.runningFailed' : 'modals.runner.running', {
          done,
          total: items.length,
          failed
        })
      : summary
        ? t(summary.stopped ? 'modals.runner.finishedStopped' : 'modals.runner.finished', {
            passed: summary.passed,
            failed: summary.failed
          })
        : ''

  return (
    <Modal
      title={t('modals.runner.title', { title })}
      onClose={onClose}
      width={680}
      help={{ page: 'runner', topic: t('modals.runner.topic') }}
      description={
        phase !== 'loading' && items.length > 0
          ? t('modals.runner.description')
          : undefined
      }
      footer={
        phase !== 'loading' && items.length > 0 ? (
          <>
            <button type="button" className="btn" onClick={onClose}>
              {t('common.close')}
            </button>
            {phase === 'running' ? (
              <button type="button" className="btn danger" onClick={stop}>
                <StopIcon size={13} /> {t('modals.runner.stop')}
              </button>
            ) : (
              <button type="button" className="btn accent" data-autofocus onClick={start}>
                <PlayIcon size={13} />{' '}
                {phase === 'done'
                  ? t('modals.runner.runAgain')
                  : t('modals.runner.run', { count: items.length })}
              </button>
            )}
          </>
        ) : undefined
      }
    >
      {phase === 'loading' && (
        <div className="cv-dim" role="status">
          {t('modals.runner.loading')}
        </div>
      )}

      {phase !== 'loading' && items.length === 0 && (
        <div className="modal-empty">
          <PlayIcon size={28} />
          <h3>{t('modals.runner.emptyTitle')}</h3>
          <p>{t('modals.runner.emptyBody')}</p>
          <button type="button" className="btn" data-autofocus onClick={onClose}>
            {t('common.close')}
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
                aria-label={t('modals.runner.progress')}
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
                  {t(summary.stopped ? 'modals.runner.summaryStopped' : 'modals.runner.summary', {
                    passed: summary.passed,
                    failed: summary.failed
                  })}
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
              <caption className="tg-sr-only">{t('modals.runner.caption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('modals.runner.colMethod')}</th>
                  <th scope="col">{t('modals.runner.colRequest')}</th>
                  <th scope="col">{t('modals.runner.colStatus')}</th>
                  <th scope="col">{t('modals.runner.colTime')}</th>
                  <th scope="col">{t('modals.runner.colTests')}</th>
                  <th scope="col">{t('modals.runner.colResult')}</th>
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
                          <span className="runner-na">{running ? t('modals.runner.sending') : ''}</span>
                        )}
                      </td>
                      <td className="runner-num">{r?.timeMs !== undefined ? t('common.ms', { value: r.timeMs }) : ''}</td>
                      <td className="runner-num">
                        {r && r.tests.length > 0
                          ? `${r.tests.filter((test) => test.passed).length}/${r.tests.length}`
                          : ''}
                      </td>
                      <td>
                        {r ? (
                          r.passed ? (
                            <span className="runner-verdict ok">
                              <CheckIcon size={14} aria-hidden="true" /> {t('modals.runner.pass')}
                            </span>
                          ) : (
                            <span className="runner-verdict bad">
                              <XCircleIcon size={14} aria-hidden="true" /> {t('modals.runner.fail')}
                            </span>
                          )
                        ) : (
                          <span className="runner-na">{running ? t('modals.runner.statusRunning') : t('modals.runner.statusPending')}</span>
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
