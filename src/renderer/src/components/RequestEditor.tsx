import { useEffect, useRef, useState } from 'react'
import { HTTP_METHODS, type BodyType, type KeyValue, type TigerRequest } from '@core/types'
import { formatJsonText, isValidJson, minifyJsonText } from '@core/jsonHighlight'
import { KeyValueEditor } from './KeyValueEditor'
import { AuthEditor } from './AuthEditor'
import { CheckIcon, CodeIcon, CopyIcon, GaugeIcon, SaveIcon } from './Icons'
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
  onCode: () => void
  onSave: () => void
  onPerf: () => void
}

type Tab = 'params' | 'headers' | 'auth' | 'body' | 'capture' | 'scripts' | 'docs'

const BODY_TYPES: BodyType[] = ['none', 'json', 'xml', 'text', 'form', 'graphql']

export function RequestEditor({
  request,
  sending,
  diskBacked,
  dirty,
  missingVars,
  onChange,
  onSend,
  onCancel,
  onCode,
  onSave,
  onPerf
}: Props) {
  const [tab, setTab] = useState<Tab>('params')
  // Form-body rows live in component state while editing; re-deriving them
  // from the serialized text on every keystroke would drop value-only rows
  // mid-typing. The component remounts per request (key={activeId} in App),
  // so this state never leaks across requests.
  const [formRows, setFormRows] = useState<KeyValue[]>(() => formToKv(request.body.content))
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

  return (
    <section className="panel editor">
      <div className="name-row">
        <input
          className="req-name"
          value={request.name}
          spellCheck={false}
          placeholder="Request name"
          onChange={(e) => set({ name: e.target.value })}
        />
        {diskBacked && (
          <button
            className="icon-btn save-btn"
            title={dirty ? 'Unsaved changes — Save (⌘S)' : 'Save (⌘S)'}
            onClick={onSave}
          >
            <SaveIcon />
            {dirty && <span className="dirty-dot" />}
          </button>
        )}
        <button className="icon-btn" title="Generate code" onClick={onCode}>
          <CodeIcon />
        </button>
        <button className="icon-btn" title="Performance run" onClick={onPerf}>
          <GaugeIcon />
        </button>
      </div>
      <div className="urlbar" style={{ paddingTop: 8 }}>
        <select
          className="method-select"
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
          placeholder="https://api.example.com/path"
          onChange={(e) => set({ url: e.target.value })}
          onKeyDown={(e) => {
            // Plain Enter only: Cmd/Ctrl+Enter is handled by the global
            // shortcut, and matching it here too would double-send.
            if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) onSend()
          }}
        />
        {sending ? (
          <button className="btn danger" onClick={onCancel} title="Cancel request">
            Cancel
          </button>
        ) : (
          <button className="btn accent" onClick={onSend} title="Send (⌘↵)">
            Send
          </button>
        )}
      </div>
      {missingVars.length > 0 && (
        <div className="warn-row" role="status">
          Unresolved variables: {missingVars.map((v) => `{{${v}}}`).join(' ')}
          <span className="warn-hint">define them in the active environment</span>
        </div>
      )}

      <div className="tabs">
        <button className={`tab ${tab === 'params' ? 'active' : ''}`} onClick={() => setTab('params')}>
          Params {enabledCount(request.query) > 0 && <span className="count">{enabledCount(request.query)}</span>}
        </button>
        <button className={`tab ${tab === 'headers' ? 'active' : ''}`} onClick={() => setTab('headers')}>
          Headers {enabledCount(request.headers) > 0 && <span className="count">{enabledCount(request.headers)}</span>}
        </button>
        <button className={`tab ${tab === 'auth' ? 'active' : ''}`} onClick={() => setTab('auth')}>
          Auth {request.auth && request.auth.type !== 'none' && <span className="dot" />}
        </button>
        <button className={`tab ${tab === 'body' ? 'active' : ''}`} onClick={() => setTab('body')}>
          Body {request.body.type !== 'none' && <span className="dot" />}
        </button>
        <button className={`tab ${tab === 'capture' ? 'active' : ''}`} onClick={() => setTab('capture')}>
          Capture{' '}
          {enabledCount(request.captures ?? []) > 0 && (
            <span className="count">{enabledCount(request.captures ?? [])}</span>
          )}
        </button>
        <button
          className={`tab ${tab === 'scripts' ? 'active' : ''}`}
          onClick={() => setTab('scripts')}
        >
          Scripts{' '}
          {(!!request.preScript?.trim() || !!request.postScript?.trim()) && (
            <span className="dot" />
          )}
        </button>
        <button className={`tab ${tab === 'docs' ? 'active' : ''}`} onClick={() => setTab('docs')}>
          Docs {!!request.docs?.trim() && <span className="dot" />}
        </button>
      </div>

      <div className="tab-body">
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
        {tab === 'auth' && (
          <AuthEditor auth={request.auth} onChange={(auth) => set({ auth })} />
        )}
        {tab === 'body' && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="seg">
                {BODY_TYPES.map((t) => (
                  <button
                    key={t}
                    className={request.body.type === t ? 'on' : ''}
                    onClick={() => set({ body: { ...request.body, type: t } })}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {request.body.type === 'json' && request.body.content.trim() && (
                <>
                  {request.body.content.length < 100000 &&
                    !isValidJson(request.body.content) &&
                    !request.body.content.includes('{{') && (
                      <span className="json-bad">Invalid JSON</span>
                    )}
                  <div className="body-toolbar-actions">
                    <button
                      className="btn ghost"
                      style={{ padding: '5px 11px', fontSize: 12.5 }}
                      onClick={() => {
                        const result = formatJsonText(request.body.content)
                        if (result.ok) set({ body: { ...request.body, content: result.formatted! } })
                      }}
                    >
                      Format
                    </button>
                    <button
                      className="btn ghost"
                      style={{ padding: '5px 11px', fontSize: 12.5 }}
                      onClick={() => {
                        const result = minifyJsonText(request.body.content)
                        if (result.ok) set({ body: { ...request.body, content: result.formatted! } })
                      }}
                    >
                      Minify
                    </button>
                    <button className="icon-btn" title="Copy body" onClick={copyBody}>
                      {copiedBody ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                    </button>
                  </div>
                </>
              )}
            </div>
            {request.body.type === 'none' && (
              <div style={{ color: 'var(--text-dim)' }}>This request has no body.</div>
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
            {request.body.type === 'graphql' && (
              <div className="gql-body">
                <textarea
                  className="code-area gql-query"
                  spellCheck={false}
                  value={request.body.content}
                  placeholder={'query {\n  viewer { id name }\n}'}
                  onChange={(e) => set({ body: { ...request.body, content: e.target.value } })}
                />
                <label className="gql-vars-label" htmlFor="gql-vars">
                  Variables (JSON)
                </label>
                <textarea
                  id="gql-vars"
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
                value={request.body.content}
                placeholder={request.body.type === 'json' ? '{\n  "key": "value"\n}' : 'Raw body…'}
                onChange={(e) => set({ body: { ...request.body, content: e.target.value } })}
              />
            )}
          </div>
        )}
        {tab === 'capture' && (
          <KeyValueEditor
            items={request.captures ?? []}
            placeholder={['Variable', 'body.path.to.value']}
            onChange={(captures) => set({ captures })}
          />
        )}
        {tab === 'scripts' && (
          <div className="scripts-tab">
            <div className="script-block">
              <div className="script-label">
                Pre-request script
                <span className="cv-dim"> runs before the request is sent</span>
              </div>
              <textarea
                className="code-area"
                spellCheck={false}
                value={request.preScript ?? ''}
                placeholder={'// tiger.setVar("nonce", tiger.getVar("seed") + Date.now())'}
                onChange={(e) => set({ preScript: e.target.value })}
              />
            </div>
            <div className="script-block">
              <div className="script-label">
                Post-response script
                <span className="cv-dim"> runs after the response, for captures and tests</span>
              </div>
              <textarea
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
        {tab === 'docs' && (
          <textarea
            className="code-area"
            spellCheck={false}
            value={request.docs ?? ''}
            placeholder="Document this request in markdown…"
            onChange={(e) => set({ docs: e.target.value })}
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
