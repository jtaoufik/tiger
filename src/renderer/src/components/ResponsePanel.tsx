import { useState } from 'react'
import type { FormattedResponse } from '@core/response'
import { Logo } from '../Logo'
import { CheckIcon, CopyIcon, WrapIcon } from './Icons'
import { JsonView } from './JsonView'

interface Props {
  state: { loading: boolean; error?: string; data?: FormattedResponse } | undefined
}

export function ResponsePanel({ state }: Props) {
  const [tab, setTab] = useState<'body' | 'headers'>('body')
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
        <div className="seg">
          <button className={tab === 'body' ? 'on' : ''} onClick={() => setTab('body')}>
            Body
          </button>
          <button className={tab === 'headers' ? 'on' : ''} onClick={() => setTab('headers')}>
            Headers ({res.headers.length})
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
      ) : (
        <div className="response-body" style={{ whiteSpace: 'normal' }}>
          {res.headers.map((h, i) => (
            <div key={i} style={{ marginBottom: 4 }}>
              <span className="token">{h.name}</span>: {h.value}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
