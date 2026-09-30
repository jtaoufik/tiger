import { useEffect, useId, useRef, useState } from 'react'
import { humanSize, type FormattedResponse } from '@core/response'
import { parseSetCookie } from '@core/cookies'
import { findMatches } from '@core/textSearch'
import { Logo } from '../Logo'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  SaveIcon,
  SearchIcon,
  WrapIcon,
  XCircleIcon
} from './Icons'
import { HIGHLIGHT_LIMIT } from './JsonView'
import { BodyText } from './BodyText'
import { tablist } from './tablist'
import { HelpLink } from './HelpLink'
import './a11y.css'
import './ResponsePanel.css'
import { MOD } from '../platform'

// Hard cap on what we render into the DOM. A multi-MB body laid out as
// `white-space: pre` is what froze the viewer on big responses; past this
// size we slice the visible portion and surface a banner. Copy and Save
// still operate on the full body via res.body / res.raw.
const RENDER_LIMIT = 1_000_000

type RespTab = 'body' | 'headers' | 'cookies' | 'tests'

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
  const [tab, setTab] = useState<RespTab>('body')
  const [pretty, setPretty] = useState(true)
  const [wrap, setWrap] = useState(false)
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)
  const [preview, setPreview] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeMatch, setActiveMatch] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const activeMarkRef = useRef<HTMLElement>(null)
  // Where focus was before search opened, so Esc can hand it back.
  const searchOpenerRef = useRef<HTMLElement | null>(null)
  const uid = useId()
  const hasData = !!state?.data

  const openSearch = () => {
    const active = document.activeElement as HTMLElement | null
    if (active && active !== document.body && active !== searchInputRef.current) {
      searchOpenerRef.current = active
    }
    setTab('body')
    setSearchOpen(true)
    setTimeout(() => searchInputRef.current?.select(), 0)
  }

  const closeSearch = () => {
    setSearchOpen(false)
    const back = searchOpenerRef.current
    searchOpenerRef.current = null
    // Fall back to the body region when the opener is gone.
    setTimeout(() => {
      if (back && back.isConnected) back.focus()
      else document.getElementById(`${uid}-body`)?.focus()
    }, 0)
  }

  // Cmd/Ctrl+F opens search whenever a response is on screen. Strictly the
  // platform modifier: Ctrl+F must keep its cursor-forward meaning on macOS,
  // and the Windows key must not trigger it on Windows.
  useEffect(() => {
    if (!hasData) return
    const isMac = /Mac/i.test(navigator.platform)
    const onKey = (e: KeyboardEvent) => {
      if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        openSearch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // openSearch only touches refs and setters, so hasData is the only input.
  }, [hasData])

  // Keep the active match visible.
  useEffect(() => {
    activeMarkRef.current?.scrollIntoView?.({ block: 'center' })
  }, [activeMatch, query])

  const copyBody = async (body: string) => {
    try {
      await navigator.clipboard.writeText(body)
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
    setTimeout(() => setCopied(null), 1400)
  }

  if (!state) {
    return (
      <section className="panel response" aria-label="Response">
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
      <section className="panel response" aria-label="Response" aria-busy="true">
        <div className="empty">
          <div className="status-pill resp-sending" role="status">
            Sending request…
          </div>
        </div>
      </section>
    )
  }

  if (state.error) {
    return (
      <section className="panel response" aria-label="Response">
        <div className="empty" role="alert">
          <div className="status-pill status-bad resp-status">
            <XCircleIcon size={14} aria-hidden="true" /> Request failed
          </div>
          <div className="resp-error-text">{state.error}</div>
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
  const verdict = statusWord(res.status, res.ok)
  const statusLine = `${res.status} ${res.statusText || verdict}`.trim()

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
  const tests = state.tests ?? []
  const testsPassed = tests.filter((x) => x.passed).length

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

  const tabDefs: Array<{ id: RespTab; label: string; name: string }> = [
    { id: 'body', label: 'Body', name: 'Body' },
    { id: 'headers', label: `Headers (${res.headers.length})`, name: `Headers, ${res.headers.length}` },
    { id: 'cookies', label: `Cookies (${cookies.length})`, name: `Cookies, ${cookies.length}` },
    ...(tests.length
      ? [
          {
            id: 'tests' as const,
            label: `Tests (${testsPassed}/${tests.length})`,
            name: `Tests, ${testsPassed} of ${tests.length} passed`
          }
        ]
      : [])
  ]
  const current: RespTab = tabDefs.some((d) => d.id === tab) ? tab : 'body'
  const tabs = tablist(
    `${uid}-resp`,
    tabDefs.map((d) => d.id),
    current,
    setTab
  )
  const kind = res.isJson ? 'JSON' : isHtml ? 'HTML' : res.imageDataUrl ? 'image' : 'text'

  return (
    <section className="panel response" aria-label="Response">
      <div className="response-head">
        <span
          className={`status-pill resp-status ${res.ok ? 'status-ok' : 'status-bad'}`}
          title={verdict}
        >
          {res.ok ? (
            <CheckIcon size={13} aria-hidden="true" />
          ) : (
            <XCircleIcon size={13} aria-hidden="true" />
          )}
          <span>{statusLine}</span>
          {res.statusText && <span className="tg-sr-only">, {verdict}</span>}
        </span>
        <span className="timing-wrap">
          <span
            className="meta-chip timing"
            tabIndex={timingRows.length ? 0 : undefined}
            aria-describedby={timingRows.length ? `${uid}-timing` : undefined}
          >
            Time <b>{res.timeMs} ms</b>
          </span>
          {timingRows.length > 0 && (
            <span className="timing-pop" role="tooltip" id={`${uid}-timing`}>
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
        {/* One polite announcement per response, so screen readers hear the result. */}
        <span className="tg-sr-only" role="status" aria-live="polite">
          {`Response ${statusLine}${res.statusText ? `, ${verdict}` : ''}, ${res.timeMs} milliseconds, ${res.sizeLabel}`}
        </span>
        <span className="resp-spacer" />
        <button
          type="button"
          className="btn ghost resp-action"
          title="Copy the response body to the clipboard"
          aria-label={copied === 'ok' ? 'Response body copied' : 'Copy response body'}
          onClick={() => copyBody(res.body)}
        >
          {copied === 'ok' ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          <span aria-hidden="true">{copied === 'ok' ? 'Copied' : 'Copy'}</span>
        </button>
        <button
          type="button"
          className="btn ghost resp-action"
          title="Save the response body to a file"
          aria-label="Save to file: response body"
          onClick={saveToFile}
        >
          <SaveIcon size={14} />
          <span aria-hidden="true">Save to file</span>
        </button>
        <HelpLink page="response" topic="Response tools" />
        <span className="tg-sr-only" role="status" aria-live="polite">
          {copied === 'ok'
            ? 'Response body copied to clipboard'
            : copied === 'fail'
              ? 'Copy failed: clipboard unavailable'
              : ''}
        </span>
      </div>

      <div className="response-subhead">
        <div className="seg resp-tabs" role="tablist" aria-label="Response sections" onKeyDown={tabs.onKeyDown}>
          {tabDefs.map((d) => (
            <button
              key={d.id}
              type="button"
              className={current === d.id ? 'on' : ''}
              aria-label={d.name}
              {...tabs.tab(d.id)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <span className="resp-spacer" />
        {current === 'body' && res.tooLargeToPretty && (
          <span
            className="meta-chip"
            title="Highlighting and pretty-print are off for very large responses to keep Tiger responsive."
          >
            Large response · raw
          </span>
        )}
        {current === 'body' && res.isJson && !res.tooLargeToPretty && (
          <div className="seg mini" role="group" aria-label="JSON view">
            <button type="button" className={pretty ? 'on' : ''} aria-pressed={pretty} onClick={() => setPretty(true)}>
              Pretty
            </button>
            <button type="button" className={!pretty ? 'on' : ''} aria-pressed={!pretty} onClick={() => setPretty(false)}>
              Raw
            </button>
          </div>
        )}
        {current === 'body' && (isHtml || res.imageDataUrl) && (
          <div className="seg mini" role="group" aria-label="Preview mode">
            <button type="button" className={preview ? 'on' : ''} aria-pressed={preview} onClick={() => setPreview(true)}>
              Preview
            </button>
            <button type="button" className={!preview ? 'on' : ''} aria-pressed={!preview} onClick={() => setPreview(false)}>
              Raw
            </button>
          </div>
        )}
        {current === 'body' && (
          <button
            type="button"
            className={`icon-btn ${searchOpen ? 'on' : ''}`}
            title={`Search in response (${MOD}+F)`}
            aria-label="Search in response"
            aria-pressed={searchOpen}
            aria-keyshortcuts={MOD === 'Cmd' ? 'Meta+F' : 'Control+F'}
            onClick={() => (searchOpen ? closeSearch() : openSearch())}
          >
            <SearchIcon size={15} />
          </button>
        )}
        {current === 'body' && (
          <button
            type="button"
            className={`icon-btn ${wrap ? 'on' : ''}`}
            title={wrap ? 'Disable word wrap' : 'Wrap long lines'}
            aria-label="Wrap long lines"
            aria-pressed={wrap}
            onClick={() => setWrap((w) => !w)}
          >
            <WrapIcon size={15} />
          </button>
        )}
      </div>

      <div className="resp-panel" {...tabs.panel()} tabIndex={-1}>
        {current === 'body' ? (
          <>
            {searchOpen && (
              <div className="resp-search" role="search" aria-label="Search in response">
                <SearchIcon size={13} aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search in response"
                  aria-label="Search in response"
                  aria-describedby={`${uid}-search-help`}
                  aria-keyshortcuts="Enter Shift+Enter Escape"
                  value={query}
                  spellCheck={false}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setActiveMatch(0)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      nextMatch(e.shiftKey ? -1 : 1)
                    }
                    if (e.key === 'Escape') {
                      // Handled here: an enclosing dialog must not also close.
                      e.preventDefault()
                      e.stopPropagation()
                      closeSearch()
                    }
                  }}
                />
                <span id={`${uid}-search-help`} className="tg-sr-only">
                  Enter for next match, Shift+Enter for previous, Escape to close.
                </span>
                <span className="resp-search-count" aria-hidden="true">
                  {matchTotal ? `${activeMatch + 1}/${matchTotal}${search.truncated ? '+' : ''}` : '0/0'}
                </span>
                <span className="tg-sr-only" role="status" aria-live="polite">
                  {query
                    ? matchTotal
                      ? `Match ${activeMatch + 1} of ${matchTotal}${search.truncated ? ' or more' : ''}`
                      : 'No matches'
                    : ''}
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  title="Previous match (Shift+Enter)"
                  aria-label="Previous match"
                  disabled={!matchTotal}
                  onClick={() => nextMatch(-1)}
                >
                  <ArrowUpIcon size={14} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title="Next match (Enter)"
                  aria-label="Next match"
                  disabled={!matchTotal}
                  onClick={() => nextMatch(1)}
                >
                  <ArrowDownIcon size={14} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title="Close search (Esc)"
                  aria-label="Close search"
                  onClick={closeSearch}
                >
                  <CloseIcon size={14} />
                </button>
              </div>
            )}
            {renderTruncated && (
              <div className="resp-truncated" role="status">
                Body truncated to {humanSize(RENDER_LIMIT)} for performance. Use Copy or Save to get the
                full {humanSize(fullText.length)} response.
              </div>
            )}
            {showImage ? (
              <div className="response-body img-preview" id={`${uid}-body`} tabIndex={-1}>
                <img src={res.imageDataUrl} alt={`Response image (${res.contentType || 'image'}, ${res.sizeLabel})`} />
              </div>
            ) : showHtmlPreview ? (
              <iframe
                id={`${uid}-body`}
                className="html-preview"
                sandbox=""
                srcDoc={res.raw}
                title="HTML response preview (sandboxed)"
              />
            ) : (
              <div
                id={`${uid}-body`}
                className={`response-body ${wrap ? 'is-wrapped' : ''}`}
                role="region"
                aria-label={`Response body, ${kind}${showPretty ? ', pretty-printed' : ''}`}
                tabIndex={0}
                style={wrap ? { whiteSpace: 'pre-wrap', wordBreak: 'break-all' } : undefined}
              >
                {bodyText ? (
                  <BodyText
                    text={bodyText}
                    highlight={showPretty && bodyText.length <= HIGHLIGHT_LIMIT}
                    ranges={searchOpen && query && matchTotal ? search.ranges : null}
                    activeMatch={activeMatch}
                    activeRef={activeMarkRef}
                  />
                ) : (
                  <span className="resp-empty-body">Empty body. The server sent no content.</span>
                )}
              </div>
            )}
          </>
        ) : current === 'headers' ? (
          <div className="response-body resp-list" role="region" aria-label="Response headers" tabIndex={0}>
            {res.headers.length === 0 ? (
              <span className="resp-empty-body">No headers.</span>
            ) : (
              <dl className="resp-kv">
                {res.headers.map((h, i) => (
                  <div key={i} className="resp-kv-row">
                    <dt className="token">{h.name}</dt>
                    <dd>{h.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ) : current === 'cookies' ? (
          <div className="response-body resp-list" role="region" aria-label="Response cookies" tabIndex={0}>
            {cookies.length === 0 ? (
              <span className="resp-empty-body">No cookies. The response set none.</span>
            ) : (
              <dl className="resp-kv">
                {cookies.map((c, i) => (
                  <div key={i} className="resp-kv-row">
                    <dt className="token">{c.name}</dt>
                    <dd>
                      {c.value}
                      {c.attributes && <span className="resp-cookie-attrs">; {c.attributes}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ) : (
          <div className="response-body resp-list" role="region" aria-label="Test results" tabIndex={0}>
            <div className="resp-test-summary">
              {testsPassed} of {tests.length} passed
              {tests.length - testsPassed > 0 ? `, ${tests.length - testsPassed} failed` : ''}
            </div>
            <ul className="resp-tests">
              {tests.map((x, i) => (
                <li key={i} className={`test-row ${x.passed ? 'pass' : 'fail'}`}>
                  <span className="test-badge">
                    {x.passed ? (
                      <CheckIcon size={11} aria-hidden="true" />
                    ) : (
                      <XCircleIcon size={11} aria-hidden="true" />
                    )}
                    {x.passed ? 'PASS' : 'FAIL'}
                  </span>
                  <span>{x.name}</span>
                  {x.error && <span className="test-err">{x.error}</span>}
                </li>
              ))}
            </ul>
            {!!state.logs?.length && (
              <div className="script-logs" aria-label="Script log">
                {state.logs.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

/** Plain-language outcome so status is never conveyed by color alone. */
function statusWord(status: number, ok: boolean): string {
  if (status >= 200 && status < 300) return 'Success'
  if (status >= 300 && status < 400) return 'Redirect'
  if (status >= 400 && status < 500) return 'Client error'
  if (status >= 500) return 'Server error'
  return ok ? 'OK' : 'Error'
}
