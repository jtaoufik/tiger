import { useEffect, useId, useRef, useState } from 'react'
import {
  HTTP_METHODS,
  type BodyType,
  type KeyValue,
  type TigerAuth,
  type TigerEnvironment,
  type TigerRequest
} from '@core/types'
import type { BuiltRequest } from '@core/request'
import { formatJsonText, isValidJson, minifyJsonText } from '@core/jsonHighlight'
import { KeyValueEditor } from './KeyValueEditor'
import { REQUEST_SECTIONS, type RequestSectionId } from '@core/actions'
import { actionTitle } from '../actions'
import { HelpLink } from './HelpLink'
import { CodePane } from './CodePane'
import { MultipartEditor } from './MultipartEditor'
import { PerfPane } from './PerfPane'
import { AuthEditor } from './AuthEditor'
import { CheckIcon, CopyIcon, SaveIcon } from './Icons'
import { tablist } from './tablist'
import './a11y.css'
import './RequestEditor.css'

interface Props {
  request: TigerRequest
  sending: boolean
  diskBacked: boolean
  dirty: boolean
  missingVars: string[]
  onChange: (request: TigerRequest) => void
  onSend: () => void
  onCancel: () => void
  onSave: () => void
  /** Build the request with current env vars, for the Code tab. */
  getBuilt: () => BuiltRequest | null
  /** Inputs the Perf tab needs to fire the live request repeatedly. */
  perf: { collectionAuth: TigerAuth | undefined; env: TigerEnvironment | null; timeoutMs: number }
  /** Switch to a section from outside (menu "Load test"); nonce re-triggers. */
  showSection?: { id: RequestSectionId; nonce: number } | null
}

type Tab = RequestSectionId

const BODY_TYPES: BodyType[] = ['none', 'json', 'xml', 'text', 'form', 'graphql', 'multipart']

export function RequestEditor({
  request,
  sending,
  diskBacked,
  dirty,
  missingVars,
  onChange,
  onSend,
  onCancel,
  onSave,
  getBuilt,
  perf,
  showSection
}: Props) {
  const [tab, setTab] = useState<Tab>(showSection?.id ?? 'params')
  useEffect(() => {
    if (showSection) setTab(showSection.id)
  }, [showSection])
  const uid = useId()
  // Form-body rows live in component state while editing; re-deriving them
  // from the serialized text on every keystroke would drop value-only rows
  // mid-typing. The component remounts per request (key={activeId} in App),
  // so this state never leaks across requests.
  const [formRows, setFormRows] = useState<KeyValue[]>(() => formToKv(request.body.content))
  const [multipartRows, setMultipartRows] = useState<KeyValue[]>(() =>
    formToKv(request.body.content)
  )
  const [copiedBody, setCopiedBody] = useState(false)
  // Re-seed the form rows whenever the body type transitions INTO 'form'.
  // Without this, switching form -> json -> form keeps the stale rows from the
  // first form pass and silently discards JSON the user typed in between (the
  // text is in request.body.content but the form UI never reads it back).
  const prevBodyType = useRef<BodyType>(request.body.type)
  useEffect(() => {
    if (request.body.type === 'form' && prevBodyType.current !== 'form') {
      setFormRows(formToKv(request.body.content))
    }
    if (request.body.type === 'multipart' && prevBodyType.current !== 'multipart') {
      setMultipartRows(formToKv(request.body.content))
    }
    prevBodyType.current = request.body.type
  }, [request.body.type, request.body.content])

  const set = (patch: Partial<TigerRequest>) => onChange({ ...request, ...patch })
  const enabledCount = (kv: KeyValue[]) => kv.filter((k) => k.enabled !== false && k.name).length

  const copyBody = async () => {
    try {
      await navigator.clipboard.writeText(request.body.content)
      setCopiedBody(true)
      setTimeout(() => setCopiedBody(false), 1200)
    } catch {
      /* clipboard unavailable */
    }
  }

  const hasAuth = !!request.auth && request.auth.type !== 'none'
  const hasScripts = !!request.preScript?.trim() || !!request.postScript?.trim()
  const hasDocs = !!request.docs?.trim()
  // Labels, order and descriptions come from the registry; this only adds
  // what is set, so a count or a dot shows which sections are in use.
  const state: Partial<Record<Tab, { count?: number; flag?: string }>> = {
    params: { count: enabledCount(request.query) },
    headers: { count: enabledCount(request.headers) },
    auth: { flag: hasAuth ? 'set' : undefined },
    body: { flag: request.body.type !== 'none' ? request.body.type : undefined },
    capture: { count: enabledCount(request.captures ?? []) },
    scripts: { flag: hasScripts ? 'has scripts' : undefined },
    docs: { flag: hasDocs ? 'written' : undefined }
  }
  const tabDefs = REQUEST_SECTIONS.map((sec) => ({ ...sec, ...state[sec.id] }))
  const current = REQUEST_SECTIONS.find((sec) => sec.id === tab)!
  /** One-line explanation plus a guide link, for the less obvious sections. */
  const intro = (
    <p className="panel-intro" id={`${uid}-intro`}>
      <span>{current.description}</span>
      {'docs' in current && current.docs && <HelpLink page={current.docs} topic={current.label} />}
    </p>
  )
  const tabs = tablist(
    `${uid}-req`,
    tabDefs.map((t) => t.id),
    tab,
    setTab
  )

  const bodyIsJson = request.body.type === 'json'
  const jsonInvalid =
    bodyIsJson &&
    !!request.body.content.trim() &&
    request.body.content.length < 100000 &&
    !isValidJson(request.body.content) &&
    !request.body.content.includes('{{')

  return (
    <section className="panel editor" aria-label="Request editor">
      <div className="name-row">
        <input
          className="req-name"
          value={request.name}
          spellCheck={false}
          placeholder="Request name"
          aria-label="Request name"
          title={request.name.length > 40 ? request.name : undefined}
          onChange={(e) => set({ name: e.target.value })}
        />
        {diskBacked && (
          <button
            type="button"
            className="icon-btn save-btn"
            title={dirty ? `Unsaved changes. ${actionTitle('save')}` : actionTitle('save')}
            aria-label={dirty ? 'Save request (unsaved changes)' : 'Save request'}
            onClick={onSave}
          >
            <SaveIcon />
            {dirty && <span className="dirty-dot" aria-hidden="true" />}
          </button>
        )}
      </div>
      <div className="urlbar" style={{ paddingTop: 8 }}>
        <select
          className="method-select"
          aria-label="HTTP method"
          value={request.method}
          onChange={(e) => set({ method: e.target.value as TigerRequest['method'] })}
        >
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m}>
              {m.toUpperCase()}
            </option>
          ))}
        </select>
        <input
          className="url-input"
          spellCheck={false}
          value={request.url}
          placeholder="https://api.example.com/users/{{userId}}"
          aria-label="Request URL"
          aria-describedby={missingVars.length > 0 ? `${uid}-missing` : undefined}
          title={request.url.length > 60 ? request.url : undefined}
          onChange={(e) => set({ url: e.target.value })}
          onKeyDown={(e) => {
            // Plain Enter only: Cmd/Ctrl+Enter is handled by the global
            // shortcut, and matching it here too would double-send.
            if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) onSend()
          }}
        />
        {sending ? (
          <button type="button" className="btn danger" onClick={onCancel} title="Cancel request">
            Cancel
          </button>
        ) : (
          <button type="button" className="btn accent" onClick={onSend} title={actionTitle('send')}>
            Send
          </button>
        )}
      </div>
      {missingVars.length > 0 && (
        <div className="warn-row" role="status" id={`${uid}-missing`}>
          Unresolved variables: {missingVars.map((v) => `{{${v}}}`).join(' ')}
          <span className="warn-hint">define them in the active environment</span>
        </div>
      )}

      <div className="tabs" role="tablist" aria-label="Request sections" onKeyDown={tabs.onKeyDown}>
        {tabDefs.map((t) => {
          const name = t.count ? `${t.label}, ${t.count}` : t.flag ? `${t.label}, ${t.flag}` : t.label
          return (
            <button
              key={t.id}
              type="button"
              className={`tab ${tab === t.id ? 'active' : ''}`}
              aria-label={name}
              title={t.description}
              {...tabs.tab(t.id)}
            >
              {t.label}
              {t.count ? (
                <>
                  {' '}
                  <span className="count" aria-hidden="true">
                    {t.count}
                  </span>
                </>
              ) : t.flag ? (
                <span className="dot" aria-hidden="true" />
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="tab-body" {...tabs.panel()}>
        {tab === 'params' && (
          <KeyValueEditor
            items={request.query}
            placeholder={['Parameter', 'Value']}
            onChange={(query) => set({ query })}
          />
        )}
        {tab === 'headers' && (
          <KeyValueEditor
            items={request.headers}
            placeholder={['Header', 'Value']}
            onChange={(headers) => set({ headers })}
          />
        )}
        {tab === 'auth' && intro}
        {tab === 'auth' && (
          <AuthEditor auth={request.auth} onChange={(auth) => set({ auth })} />
        )}
        {tab === 'body' && (
          <div className="body-pane">
            <div className="body-toolbar">
              <div className="seg" role="group" aria-label="Body type">
                {BODY_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={request.body.type === t ? 'on' : ''}
                    aria-pressed={request.body.type === t}
                    onClick={() => set({ body: { ...request.body, type: t } })}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {bodyIsJson && request.body.content.trim() && (
                <>
                  {jsonInvalid && (
                    <span className="json-bad" id={`${uid}-json-bad`}>
                      Invalid JSON
                    </span>
                  )}
                  <div className="body-toolbar-actions">
                    <button
                      type="button"
                      className="btn ghost body-tool"
                      title="Pretty-print the JSON body"
                      onClick={() => {
                        const result = formatJsonText(request.body.content)
                        if (result.ok) set({ body: { ...request.body, content: result.formatted! } })
                      }}
                    >
                      Format
                    </button>
                    <button
                      type="button"
                      className="btn ghost body-tool"
                      title="Remove whitespace from the JSON body"
                      onClick={() => {
                        const result = minifyJsonText(request.body.content)
                        if (result.ok) set({ body: { ...request.body, content: result.formatted! } })
                      }}
                    >
                      Minify
                    </button>
                    <button
                      type="button"
                      className="icon-btn body-copy"
                      title="Copy body"
                      aria-label={copiedBody ? 'Body copied' : 'Copy body'}
                      onClick={copyBody}
                    >
                      {copiedBody ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                    </button>
                  </div>
                </>
              )}
            </div>
            <span className="tg-sr-only" role="status" aria-live="polite">
              {copiedBody ? 'Body copied to clipboard' : ''}
            </span>
            {request.body.type === 'none' && (
              <div className="body-empty">
                This request has no body. Pick a type above (json, form, multipart...) to add one.
              </div>
            )}
            {request.body.type === 'form' && (
              <KeyValueEditor
                items={formRows}
                placeholder={['Field', 'Value']}
                onChange={(kv) => {
                  setFormRows(kv)
                  set({ body: { ...request.body, content: kvToForm(kv) } })
                }}
              />
            )}
            {request.body.type === 'multipart' && (
              <MultipartEditor
                items={multipartRows}
                onChange={(kv) => {
                  setMultipartRows(kv)
                  set({ body: { ...request.body, content: kvToForm(kv) } })
                }}
              />
            )}
            {request.body.type === 'graphql' && (
              <div className="gql-body">
                <label className="gql-vars-label" htmlFor={`${uid}-gql-query`}>
                  Query
                </label>
                <textarea
                  id={`${uid}-gql-query`}
                  className="code-area gql-query"
                  spellCheck={false}
                  value={request.body.content}
                  placeholder={'query {\n  viewer { id name }\n}'}
                  onChange={(e) => set({ body: { ...request.body, content: e.target.value } })}
                />
                <label className="gql-vars-label" htmlFor={`${uid}-gql-vars`}>
                  Variables (JSON)
                </label>
                <textarea
                  id={`${uid}-gql-vars`}
                  className="code-area gql-vars"
                  spellCheck={false}
                  value={request.body.variables ?? ''}
                  placeholder={'{ "id": 1 }'}
                  onChange={(e) => set({ body: { ...request.body, variables: e.target.value } })}
                />
              </div>
            )}
            {(request.body.type === 'json' || request.body.type === 'xml' || request.body.type === 'text') && (
              <textarea
                className="code-area"
                spellCheck={false}
                aria-label={`Request body (${request.body.type.toUpperCase()})`}
                aria-invalid={jsonInvalid || undefined}
                aria-describedby={jsonInvalid ? `${uid}-json-bad` : undefined}
                value={request.body.content}
                placeholder={
                  request.body.type === 'json'
                    ? '{\n  "name": "Ada",\n  "email": "ada@example.com"\n}'
                    : request.body.type === 'xml'
                      ? '<user>\n  <name>Ada</name>\n</user>'
                      : 'Raw body text'
                }
                onChange={(e) => set({ body: { ...request.body, content: e.target.value } })}
              />
            )}
          </div>
        )}
        {tab === 'capture' && (
          <>
            {intro}
            <KeyValueEditor
              items={request.captures ?? []}
              placeholder={['Variable', 'body.data.id']}
              columns={['Variable', 'Read from response']}
              noun="Saved value"
              onChange={(captures) => set({ captures })}
            />
            <p className="cv-dim script-help">
              Left: the variable to write. Right: where to read it, e.g. status,
              header.x-request-id or body.data[0].id. Use it later as {'{{variable}}'}.
            </p>
          </>
        )}
        {tab === 'scripts' && (
          <div className="scripts-tab">
            {intro}
            <div className="script-block">
              <label className="script-label" htmlFor={`${uid}-pre`}>
                Pre-request script
                <span className="cv-dim"> runs before the request is sent</span>
              </label>
              <textarea
                id={`${uid}-pre`}
                className="code-area"
                spellCheck={false}
                value={request.preScript ?? ''}
                placeholder={'// tiger.setVar("nonce", tiger.getVar("seed") + Date.now())'}
                onChange={(e) => set({ preScript: e.target.value })}
              />
            </div>
            <div className="script-block">
              <label className="script-label" htmlFor={`${uid}-post`}>
                Post-response script
                <span className="cv-dim"> runs after the response, for captures and tests</span>
              </label>
              <textarea
                id={`${uid}-post`}
                className="code-area"
                spellCheck={false}
                value={request.postScript ?? ''}
                placeholder={
                  '// tiger.test("ok", () => tiger.expect(tiger.response.status === 200))\n// tiger.setVar("id", tiger.response.json.id)'
                }
                onChange={(e) => set({ postScript: e.target.value })}
              />
            </div>
            <div className="cv-dim script-help">
              API: tiger.getVar(name), tiger.setVar(name, value), tiger.response (status, headers,
              body, json), tiger.test(name, fn), tiger.expect(cond, message), tiger.log(...)
            </div>
          </div>
        )}
        {tab === 'docs' && intro}
        {tab === 'docs' && (
          <textarea
            className="code-area"
            spellCheck={false}
            aria-label="Request notes (Markdown)"
            value={request.docs ?? ''}
            placeholder={'## What this does\nReturns the current user. Needs a bearer token.'}
            onChange={(e) => set({ docs: e.target.value })}
          />
        )}
        {tab === 'code' && <CodePane getBuilt={getBuilt} />}
        {tab === 'perf' && intro}
        {tab === 'perf' && (
          <PerfPane
            request={request}
            collectionAuth={perf.collectionAuth}
            env={perf.env}
            timeoutMs={perf.timeoutMs}
          />
        )}
      </div>
    </section>
  )
}

function formToKv(content: string): KeyValue[] {
  return content
    .split('\n')
    .filter((l) => l.trim())
    .map((line) => {
      const disabled = line.trimStart().startsWith('~')
      const l = disabled ? line.trim().slice(1) : line
      const idx = l.indexOf(':')
      return {
        name: idx === -1 ? l.trim() : l.slice(0, idx).trim(),
        value: idx === -1 ? '' : l.slice(idx + 1).trim(),
        enabled: !disabled
      }
    })
}

function kvToForm(items: KeyValue[]): string {
  // Value-only rows serialize as ": value" so nothing typed is ever dropped.
  return items
    .filter((kv) => kv.name || kv.value)
    .map((kv) => `${kv.enabled === false ? '~' : ''}${kv.name}: ${kv.value}`)
    .join('\n')
}
