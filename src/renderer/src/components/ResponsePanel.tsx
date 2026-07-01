import { useEffect, useRef, useState } from 'react'
import { humanSize, type FormattedResponse } from '@core/response'
import { parseSetCookie } from '@core/cookies'
import { findMatches, splitByRanges } from '@core/textSearch'
import { Logo } from '../Logo'
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, CloseIcon, CopyIcon, SaveIcon, SearchIcon, WrapIcon } from './Icons'
import { JsonView } from './JsonView'
import './ResponsePanel.css'
import { MOD } from '../platform'

// Hard cap on what we render into the DOM. A multi-MB body laid out as
// `white-space: pre` is what froze the viewer on big responses; past this
// size we slice the visible portion and surface a banner. Copy and Save
// still operate on the full body via res.body / res.raw.
const RENDER_LIMIT = 1_000_000

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
  const [preview, setPreview] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeMatch, setActiveMatch] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const activeMarkRef = useRef<HTMLElement>(null)
  const hasData = !!state?.data

  // Cmd/Ctrl+F opens search whenever a response is on screen. Strictly the
  // platform modifier: Ctrl+F must keep its cursor-forward meaning on macOS,
  // and the Windows key must not trigger it on Windows.
  useEffect(() => {
    if (!hasData) return
    const isMac = /Mac/i.test(navigator.platform)
    const onKey = (e: KeyboardEvent) => {
      if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setTab('body')
        setSearchOpen(true)
        setTimeout(() => searchInputRef.current?.select(), 0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hasData])

  // Keep the active match visible.
  useEffect(() => {
    activeMarkRef.current?.scrollIntoView?.({ block: 'center' })
  }, [activeMatch, query])

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
  const fullText = showPretty ? res.body : res.raw
  const renderTruncated = fullText.length > RENDER_LIMIT
  const bodyText = renderTruncated ? fullText.slice(0, RENDER_LIMIT) : fullText
  const isHtml = /text\/html/i.test(res.contentType)
  const showImage = !!res.imageDataUrl && preview
  const showHtmlPreview = isHtml && preview && !res.imageDataUrl

  const t = res.timings
  const timingRows: Array<[string, number]> = t
    ? ([
        t.dns != null ? ['DNS lookup', t.dns] : null,
        t.tcp != null ? ['TCP connect', t.tcp] : null,
        t.tls != null ? ['TLS handshake', t.tls] : null,
        ['Waiting (TTFB)', t.waiting],
        ['Download', t.download],
        ['Total', t.total]
      ].filter(Boolean) as Array<[string, number]>)
    : []
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

  const search = query && searchOpen ? findMatches(bodyText, query) : { ranges: [], truncated: false }
  const matchTotal = search.ranges.length

  const nextMatch = (dir: 1 | -1) => {
    if (!matchTotal) return
    setActiveMatch((cur) => (cur + dir + matchTotal) % matchTotal)
  }

  return (
    <section className="panel response">
      <div className="response-head">
        <span className={`status-pill ${res.ok ? 'status-ok' : 'status-bad'}`}>
          {res.status} {res.statusText}
        </span>
        <span className="timing-wrap">
          <span className="meta-chip timing">
            Time <b>{res.timeMs} ms</b>
          </span>
          {timingRows.length > 0 && (
            <span className="timing-pop" role="tooltip">
              {timingRows.map(([label, ms]) => (
                <span key={label} className={`timing-row ${label === 'Total' ? 'total' : ''}`}>
                  <span>{label}</span>
                  <b>{ms} ms</b>
                </span>
              ))}
            </span>
          )}
        </span>
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
        {tab === 'body' && (isHtml || res.imageDataUrl) && (
          <div className="seg mini">
            <button className={preview ? 'on' : ''} onClick={() => setPreview(true)}>
              Preview
            </button>
            <button className={!preview ? 'on' : ''} onClick={() => setPreview(false)}>
              Raw
            </button>
          </div>
        )}
        {tab === 'body' && (
          <button
            className="icon-btn"
            title={`Search in response (${MOD}+F)`}
            style={searchOpen ? { color: 'var(--accent)' } : undefined}
            onClick={() => {
              setSearchOpen((o) => !o)
              setTimeout(() => searchInputRef.current?.select(), 0)
            }}
          >
            <SearchIcon size={14} />
          </button>
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
        <>
          {searchOpen && (
            <div className="resp-search">
              <SearchIcon size={13} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search in response"
                value={query}
                spellCheck={false}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActiveMatch(0)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') nextMatch(e.shiftKey ? -1 : 1)
                  if (e.key === 'Escape') setSearchOpen(false)
                }}
              />
              <span className="resp-search-count">
                {matchTotal ? `${activeMatch + 1}/${matchTotal}${search.truncated ? '+' : ''}` : '0/0'}
              </span>
              <button className="icon-btn" title="Previous match (Shift+Enter)" onClick={() => nextMatch(-1)}>
                <ArrowUpIcon size={13} />
              </button>
              <button className="icon-btn" title="Next match (Enter)" onClick={() => nextMatch(1)}>
                <ArrowDownIcon size={13} />
              </button>
              <button className="icon-btn" title="Close search (Esc)" onClick={() => setSearchOpen(false)}>
                <CloseIcon size={13} />
              </button>
            </div>
          )}
          {renderTruncated && (
            <div className="resp-truncated" role="status">
              Body truncated to {humanSize(RENDER_LIMIT)} for performance. Use Copy or Save to get the full {humanSize(fullText.length)} response.
            </div>
          )}
          {showImage ? (
            <div className="response-body img-preview">
              <img src={res.imageDataUrl} alt="Response image preview" />
            </div>
          ) : showHtmlPreview ? (
            <iframe className="html-preview" sandbox="" srcDoc={res.raw} title="HTML response preview" />
          ) : (
            <div
              className="response-body"
              style={wrap ? { whiteSpace: 'pre-wrap', wordBreak: 'break-all' } : undefined}
            >
              {bodyText ? (
                searchOpen && query && matchTotal ? (
                  splitByRanges(bodyText, search.ranges).map((seg, i) =>
                    seg.match === null ? (
                      seg.text
                    ) : (
                      <mark
                        key={i}
                        ref={seg.match === activeMatch ? activeMarkRef : undefined}
                        className={seg.match === activeMatch ? 'hit active' : 'hit'}
                      >
                        {seg.text}
                      </mark>
                    )
                  )
                ) : showPretty ? (
                  <JsonView text={bodyText} />
                ) : (
                  bodyText
                )
              ) : (
                '(empty body)'
              )}
            </div>
          )}
        </>
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
