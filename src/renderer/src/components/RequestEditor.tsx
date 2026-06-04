import { useState } from 'react'
import { HTTP_METHODS, type BodyType, type KeyValue, type TigerRequest } from '@core/types'
import { KeyValueEditor } from './KeyValueEditor'
import { AuthEditor } from './AuthEditor'
import { CodeIcon, SaveIcon } from './Icons'

interface Props {
  request: TigerRequest
  sending: boolean
  diskBacked: boolean
  onChange: (request: TigerRequest) => void
  onSend: () => void
  onCode: () => void
  onSave: () => void
}

type Tab = 'params' | 'headers' | 'auth' | 'body'

const BODY_TYPES: BodyType[] = ['none', 'json', 'text', 'form']

export function RequestEditor({
  request,
  sending,
  diskBacked,
  onChange,
  onSend,
  onCode,
  onSave
}: Props) {
  const [tab, setTab] = useState<Tab>('params')
  // Form-body rows live in component state while editing; re-deriving them
  // from the serialized text on every keystroke would drop value-only rows
  // mid-typing. The component remounts per request (key={activeId} in App),
  // so this state never leaks across requests.
  const [formRows, setFormRows] = useState<KeyValue[]>(() => formToKv(request.body.content))

  const set = (patch: Partial<TigerRequest>) => onChange({ ...request, ...patch })
  const enabledCount = (kv: KeyValue[]) => kv.filter((k) => k.enabled !== false && k.name).length

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
          <button className="icon-btn" title="Save (⌘S)" onClick={onSave}>
            <SaveIcon />
          </button>
        )}
        <button className="icon-btn" title="Generate code" onClick={onCode}>
          <CodeIcon />
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
        <button className="btn accent" disabled={sending} onClick={onSend} title="Send (⌘↵)">
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>

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
            <div className="seg" style={{ alignSelf: 'flex-start' }}>
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
            {(request.body.type === 'json' || request.body.type === 'text') && (
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
