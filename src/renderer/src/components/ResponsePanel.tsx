import { useEffect, useId, useRef, useState } from 'react'
import type { Translator } from '@core/i18n'
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
import { useT } from '../i18n'

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
  const t = useT()
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
      <section className="panel response" aria-label={t('response.title')}>
        <div className="empty">
          <Logo size={54} rounded />
          <h3>{t('response.empty.title')}</h3>
          <div>{t('response.empty.body')}</div>
        </div>
      </section>
    )
  }

  if (state.loading) {
    return (
      <section className="panel response" aria-label={t('response.title')} aria-busy="true">
        <div className="empty">
          <div className="status-pill resp-sending" role="status">
            {t('response.sending')}
          </div>
        </div>
      </section>
    )
  }

  if (state.error) {
    return (
      <section className="panel response" aria-label={t('response.title')}>
        <div className="empty" role="alert">
          <div className="status-pill status-bad resp-status">
            <XCircleIcon size={14} aria-hidden="true" /> {t('response.failed')}
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
  const verdict = statusWord(res.status, res.ok, t)
  const statusLine = `${res.status} ${res.statusText || verdict}`.trim()

  const tm = res.timings
  const timingRows: Array<[string, string, number]> = tm
    ? ([
        tm.dns != null ? ['dns', t('response.timing.dns'), tm.dns] : null,
        tm.tcp != null ? ['tcp', t('response.timing.tcp'), tm.tcp] : null,
        tm.tls != null ? ['tls', t('response.timing.tls'), tm.tls] : null,
        ['waiting', t('response.timing.waiting'), tm.waiting],
        ['download', t('response.timing.download'), tm.download],
        ['total', t('response.timing.total'), tm.total]
      ].filter(Boolean) as Array<[string, string, number]>)
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
    { id: 'body', label: t('response.tabs.body'), name: t('response.tabs.body') },
    {
      id: 'headers',
      label: t('response.tabs.headers', { count: t.number(res.headers.length) }),
      name: t('response.tabs.headersName', { count: t.number(res.headers.length) })
    },
    {
      id: 'cookies',
      label: t('response.tabs.cookies', { count: t.number(cookies.length) }),
      name: t('response.tabs.cookiesName', { count: t.number(cookies.length) })
    },
    ...(tests.length
      ? [
          {
            id: 'tests' as const,
            label: t('response.tabs.tests', { passed: testsPassed, total: tests.length }),
            name: t('response.tabs.testsName', { passed: testsPassed, total: tests.length })
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
  const kind = t(
    res.isJson
      ? 'response.kind.json'
      : isHtml
        ? 'response.kind.html'
        : res.imageDataUrl
          ? 'response.kind.image'
          : 'response.kind.text'
  )

  return (
    <section className="panel response" aria-label={t('response.title')}>
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
          {res.statusText && (
            <span className="tg-sr-only">{t('response.verdict.srSuffix', { verdict })}</span>
          )}
        </span>
        <span className="timing-wrap">
          <span
            className="meta-chip timing"
            tabIndex={timingRows.length ? 0 : undefined}
            aria-describedby={timingRows.length ? `${uid}-timing` : undefined}
          >
            {t('response.meta.time')} <b>{t('response.meta.ms', { ms: t.number(res.timeMs) })}</b>
          </span>
          {timingRows.length > 0 && (
            <span className="timing-pop" role="tooltip" id={`${uid}-timing`}>
              {timingRows.map(([id, label, ms]) => (
                <span key={id} className={`timing-row ${id === 'total' ? 'total' : ''}`}>
                  <span>{label}</span>
                  <b>{t('response.meta.ms', { ms: t.number(ms) })}</b>
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="meta-chip">
          {t('response.meta.size')} <b>{t.ltr(res.sizeLabel)}</b>
        </span>
        {/* One polite announcement per response, so screen readers hear the result. */}
        <span className="tg-sr-only" role="status" aria-live="polite">
          {t(res.statusText ? 'response.announceVerdict' : 'response.announce', {
            status: statusLine,
            verdict,
            ms: t.number(res.timeMs),
            size: res.sizeLabel
          })}
        </span>
        <span className="resp-spacer" />
        <button
          type="button"
          className="btn ghost resp-action"
          title={t('response.copy.title')}
          aria-label={copied === 'ok' ? t('response.copy.ariaDone') : t('response.copy.aria')}
          onClick={() => copyBody(res.body)}
        >
          {copied === 'ok' ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          <span aria-hidden="true">{copied === 'ok' ? t('common.copied') : t('common.copy')}</span>
        </button>
        <button
          type="button"
          className="btn ghost resp-action"
          title={t('response.save.title')}
          aria-label={t('response.save.aria')}
          onClick={saveToFile}
        >
          <SaveIcon size={14} />
          <span aria-hidden="true">{t('response.save.label')}</span>
        </button>
        <HelpLink page="response" topic={t('response.helpTopic')} />
        <span className="tg-sr-only" role="status" aria-live="polite">
          {copied === 'ok'
            ? t('response.copy.announceOk')
            : copied === 'fail'
              ? t('response.copy.announceFail')
              : ''}
        </span>
      </div>

      <div className="response-subhead">
        <div className="seg resp-tabs" role="tablist" aria-label={t('response.tabs.label')} onKeyDown={tabs.onKeyDown}>
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
            title={t('response.large.title')}
          >
            {t('response.large.chip')}
          </span>
        )}
        {current === 'body' && res.isJson && !res.tooLargeToPretty && (
          <div className="seg mini" role="group" aria-label={t('response.jsonView')}>
            <button type="button" className={pretty ? 'on' : ''} aria-pressed={pretty} onClick={() => setPretty(true)}>
              {t('response.pretty')}
            </button>
            <button type="button" className={!pretty ? 'on' : ''} aria-pressed={!pretty} onClick={() => setPretty(false)}>
              {t('response.raw')}
            </button>
          </div>
        )}
        {current === 'body' && (isHtml || res.imageDataUrl) && (
          <div className="seg mini" role="group" aria-label={t('response.previewMode')}>
            <button type="button" className={preview ? 'on' : ''} aria-pressed={preview} onClick={() => setPreview(true)}>
              {t('response.preview')}
            </button>
            <button type="button" className={!preview ? 'on' : ''} aria-pressed={!preview} onClick={() => setPreview(false)}>
              {t('response.raw')}
            </button>
          </div>
        )}
        {current === 'body' && (
          <button
            type="button"
            className={`icon-btn ${searchOpen ? 'on' : ''}`}
            title={t('response.search.title', { shortcut: `${MOD}+F` })}
            aria-label={t('response.search.label')}
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
            title={wrap ? t('response.wrap.off') : t('response.wrap.on')}
            aria-label={t('response.wrap.aria')}
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
              <div className="resp-search" role="search" aria-label={t('response.search.label')}>
                <SearchIcon size={13} aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder={t('response.search.label')}
                  aria-label={t('response.search.label')}
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
                  {t('response.search.help')}
                </span>
                <span className="resp-search-count" aria-hidden="true">
                  {matchTotal
                    ? `${t.number(activeMatch + 1)}/${t.number(matchTotal)}${search.truncated ? '+' : ''}`
                    : '0/0'}
                </span>
                <span className="tg-sr-only" role="status" aria-live="polite">
                  {query
                    ? matchTotal
                      ? t(search.truncated ? 'response.search.matchMore' : 'response.search.match', {
                          index: t.number(activeMatch + 1),
                          total: t.number(matchTotal)
                        })
                      : t('response.search.none')
                    : ''}
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  title={t('response.search.prevTitle')}
                  aria-label={t('response.search.prev')}
                  disabled={!matchTotal}
                  onClick={() => nextMatch(-1)}
                >
                  <ArrowUpIcon size={14} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title={t('response.search.nextTitle')}
                  aria-label={t('response.search.next')}
                  disabled={!matchTotal}
                  onClick={() => nextMatch(1)}
                >
                  <ArrowDownIcon size={14} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title={t('response.search.closeTitle')}
                  aria-label={t('response.search.close')}
                  onClick={closeSearch}
                >
                  <CloseIcon size={14} />
                </button>
              </div>
            )}
            {renderTruncated && (
              <div className="resp-truncated" role="status">
                {t('response.truncated', {
                  limit: humanSize(RENDER_LIMIT),
                  size: humanSize(fullText.length)
                })}
              </div>
            )}
            {showImage ? (
              <div className="response-body img-preview" id={`${uid}-body`} tabIndex={-1}>
                <img src={res.imageDataUrl} alt={t('response.imageAlt', {
                    type: res.contentType || t('response.kind.image'),
                    size: res.sizeLabel
                  })} />
              </div>
            ) : showHtmlPreview ? (
              <iframe
                id={`${uid}-body`}
                className="html-preview"
                sandbox=""
                srcDoc={res.raw}
                title={t('response.htmlPreviewTitle')}
              />
            ) : (
              <div
                id={`${uid}-body`}
                className={`response-body ${wrap ? 'is-wrapped' : ''}`}
                role="region"
                aria-label={t(showPretty ? 'response.bodyRegionPretty' : 'response.bodyRegion', { kind })}
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
                  <span className="resp-empty-body">{t('response.emptyBody')}</span>
                )}
              </div>
            )}
          </>
        ) : current === 'headers' ? (
          <div className="response-body resp-list" role="region" aria-label={t('response.headersRegion')} tabIndex={0}>
            {res.headers.length === 0 ? (
              <span className="resp-empty-body">{t('response.noHeaders')}</span>
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
          <div className="response-body resp-list" role="region" aria-label={t('response.cookiesRegion')} tabIndex={0}>
            {cookies.length === 0 ? (
              <span className="resp-empty-body">{t('response.noCookies')}</span>
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
          <div className="response-body resp-list" role="region" aria-label={t('response.testsRegion')} tabIndex={0}>
            <div className="resp-test-summary">
              {tests.length - testsPassed > 0
                ? t('response.tests.summaryFailed', {
                    passed: testsPassed,
                    count: tests.length,
                    failed: tests.length - testsPassed
                  })
                : t('response.tests.summary', { passed: testsPassed, count: tests.length })}
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
                    {x.passed ? t('response.tests.pass') : t('response.tests.fail')}
                  </span>
                  <span>{x.name}</span>
                  {x.error && <span className="test-err">{x.error}</span>}
                </li>
              ))}
            </ul>
            {!!state.logs?.length && (
              <div className="script-logs" aria-label={t('response.scriptLog')}>
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
function statusWord(status: number, ok: boolean, t: Translator): string {
  if (status >= 200 && status < 300) return t('response.verdict.success')
  if (status >= 300 && status < 400) return t('response.verdict.redirect')
  if (status >= 400 && status < 500) return t('response.verdict.clientError')
  if (status >= 500) return t('response.verdict.serverError')
  return ok ? t('response.verdict.ok') : t('response.verdict.error')
}
