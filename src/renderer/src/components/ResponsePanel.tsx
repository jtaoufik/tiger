import { useState } from 'react'
import type { FormattedResponse } from '@core/response'
import { parseSetCookie } from '@core/cookies'
import { Logo } from '../Logo'
import { CheckIcon, CopyIcon, SaveIcon, WrapIcon } from './Icons'
import { JsonView } from './JsonView'

interface Props {
  state: { loading: boolean; error?: string; data?: FormattedResponse } | undefined
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
  const [tab, setTab] = useState<'body' | 'headers' | 'cookies'>('body')
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
  const showPretty = pretty && res.isJson
  const bodyText = showPretty ? res.body : res.raw
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
        <span className="meta-chip">
          Time <b>{res.timeMs} ms</b>
        </span>
        <span className="meta-chip">
          Size <b>{res.sizeLabel}</b>
        </span>
        <span style={{ flex: 1 }} />
        {tab === 'body' && res.isJson && (
          <div className="seg mini">
            <button className={pretty ? 'on' : ''} onClick={() => setPretty(true)}>
              Pretty
            </button>
            <button className={!pretty ? 'on' : ''} onClick={() => setPretty(false)}>
              Raw
            </button>
          </div>
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
      ) : (
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
      )}
    </section>
  )
}
