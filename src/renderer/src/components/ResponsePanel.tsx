import { useState } from 'react'
import type { FormattedResponse } from '@core/response'
import { parseSetCookie } from '@core/cookies'
import { Logo } from '../Logo'
import { CheckIcon, CopyIcon, SaveIcon, WrapIcon } from './Icons'
import { JsonView } from './JsonView'

interface ScriptTest {
  name: string
  passed: boolean
  error?: string
}
interface Props {
  state:
    | {
        loading: boolean
        error?: string
        data?: FormattedResponse
        tests?: ScriptTest[]
        logs?: string[]
      }
    | undefined
}

/** Browser-preview fallback when the Electron save dialog is unavailable. */
function downloadText(filename: string, text: string): boolean {
  if (typeof URL.createObjectURL !== 'function') return false
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/octet-stream' }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
  return true
}

export function ResponsePanel({ state }: Props) {
  const [tab, setTab] = useState<'body' | 'headers' | 'cookies' | 'tests'>('body')
  const [pretty, setPretty] = useState(true)
  const [wrap, setWrap] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyBody = async (body: string) => {
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* clipboard unavailable */
    }
  }

  if (!state) {
    return (
      <section className="panel response">
        <div className="empty">
          <Logo size={54} rounded />
          <h3>Ready when you are</h3>
          <div>Pick a request and hit Send to see the response here.</div>
        </div>
      </section>
    )
  }

  if (state.loading) {
    return (
      <section className="panel response">
        <div className="empty">
          <div className="status-pill">Sending…</div>
        </div>
      </section>
    )
  }

  if (state.error) {
    return (
      <section className="panel response">
        <div className="empty">
          <div className="status-pill status-bad">Request failed</div>
          <div style={{ fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{state.error}</div>
        </div>
      </section>
    )
  }

  const res = state.data!
  // Skip tokenized highlighting for very large bodies to stay responsive.
  const showPretty = pretty && res.isJson && !res.tooLargeToPretty
  const bodyText = showPretty ? res.body : res.raw

  const t = res.timings
  const timingTitle = t
    ? [
        t.dns != null ? `DNS lookup  ${t.dns} ms` : null,
        t.tcp != null ? `TCP connect  ${t.tcp} ms` : null,
        t.tls != null ? `TLS handshake  ${t.tls} ms` : null,
        `Waiting (TTFB)  ${t.waiting} ms`,
        `Download  ${t.download} ms`,
        `Total  ${t.total} ms`
      ]
        .filter(Boolean)
        .join('\n')
    : ''
  const cookies = parseSetCookie(
    res.headers.filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value)
  )

  const saveToFile = async () => {
    const filename = res.isJson ? 'response.json' : 'response.txt'
    try {
      if (window.tiger?.exportCollection) {
        await window.tiger.exportCollection(filename, res.raw)
      } else {
        downloadText(filename, res.raw)
      }
    } catch {
      /* save dialog unavailable or canceled */
    }
  }

  return (
    <section className="panel response">
      <div className="response-head">
        <span className={`status-pill ${res.ok ? 'status-ok' : 'status-bad'}`}>
          {res.status} {res.statusText}
        </span>
        <span className="meta-chip" title={timingTitle}>
          Time <b>{res.timeMs} ms</b>
        </span>
        {t && (t.waiting > 0 || t.download > 0) && (
          <span className="meta-chip timing" title={timingTitle}>
            TTFB <b>{t.waiting} ms</b> · Down <b>{t.download} ms</b>
          </span>
        )}
        <span className="meta-chip">
          Size <b>{res.sizeLabel}</b>
        </span>
        <span style={{ flex: 1 }} />
        {tab === 'body' && res.isJson && !res.tooLargeToPretty && (
          <div className="seg mini">
            <button className={pretty ? 'on' : ''} onClick={() => setPretty(true)}>
              Pretty
            </button>
            <button className={!pretty ? 'on' : ''} onClick={() => setPretty(false)}>
              Raw
            </button>
          </div>
        )}
        {tab === 'body' && res.tooLargeToPretty && (
          <span className="meta-chip" title="Highlighting and pretty-print are off for very large responses to keep Tiger responsive.">
            Large response · raw
          </span>
        )}
        {tab === 'body' && (
          <button
            className="icon-btn"
            title={wrap ? 'Disable word wrap' : 'Wrap long lines'}
            style={wrap ? { color: 'var(--accent)' } : undefined}
            onClick={() => setWrap((w) => !w)}
          >
            <WrapIcon size={14} />
          </button>
        )}
        <button className="icon-btn" title="Copy response body" onClick={() => copyBody(res.body)}>
          {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
        </button>
        <button className="icon-btn" title="Save response to file" onClick={saveToFile}>
          <SaveIcon size={14} />
        </button>
        <div className="seg">
          <button className={tab === 'body' ? 'on' : ''} onClick={() => setTab('body')}>
            Body
          </button>
          <button className={tab === 'headers' ? 'on' : ''} onClick={() => setTab('headers')}>
            Headers ({res.headers.length})
          </button>
          <button className={tab === 'cookies' ? 'on' : ''} onClick={() => setTab('cookies')}>
            Cookies ({cookies.length})
          </button>
          {!!state?.tests?.length && (
            <button className={tab === 'tests' ? 'on' : ''} onClick={() => setTab('tests')}>
              Tests ({state.tests.filter((t) => t.passed).length}/{state.tests.length})
            </button>
          )}
        </div>
      </div>

      {tab === 'body' ? (
        <div className="response-body" style={wrap ? { whiteSpace: 'pre-wrap', wordBreak: 'break-all' } : undefined}>
          {bodyText ? (
            showPretty ? <JsonView text={bodyText} /> : bodyText
          ) : (
            '(empty body)'
          )}
        </div>
      ) : tab === 'headers' ? (
        <div className="response-body" style={{ whiteSpace: 'normal' }}>
          {res.headers.map((h, i) => (
            <div key={i} style={{ marginBottom: 4 }}>
              <span className="token">{h.name}</span>: {h.value}
            </div>
          ))}
        </div>
      ) : tab === 'cookies' ? (
        <div className="response-body" style={{ whiteSpace: 'normal' }}>
          {cookies.length === 0
            ? '(no cookies)'
            : cookies.map((c, i) => (
                <div key={i} style={{ marginBottom: 4 }}>
                  <span className="token">{c.name}</span>: {c.value}
                  {c.attributes && (
                    <span style={{ color: 'var(--text-dim)' }}>; {c.attributes}</span>
                  )}
                </div>
              ))}
        </div>
      ) : (
        <div className="response-body" style={{ whiteSpace: 'normal' }}>
          {(state?.tests ?? []).map((t, i) => (
            <div key={i} className={`test-row ${t.passed ? 'pass' : 'fail'}`}>
              <span className="test-badge">{t.passed ? 'PASS' : 'FAIL'}</span>
              <span>{t.name}</span>
              {t.error && <span className="test-err">{t.error}</span>}
            </div>
          ))}
          {!!state?.logs?.length && (
            <div className="script-logs">
              {state.logs.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
