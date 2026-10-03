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
import type { MessageKey } from '@core/i18n'
import { formatJsonText, isValidJson, minifyJsonText } from '@core/jsonHighlight'
import { KeyValueEditor } from './KeyValueEditor'
import { REQUEST_SECTIONS, sectionDescription, sectionLabel, type RequestSectionId } from '@core/actions'
import { useT } from '../i18n'
import { actionTitle } from '../actions'
import { HelpLink } from './HelpLink'
import { CodePane, PerfPane } from '../surfaces'
import { MultipartEditor } from './MultipartEditor'
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
  /** A curl command was pasted into the URL bar; parse and fill in the request. */
  onImportCurl: (command: string) => void
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

/** The scripting API: code, not translated. */
const SCRIPT_API =
  'tiger.getVar(name), tiger.setVar(name, value), tiger.response (status, headers, body, json), tiger.test(name, fn), tiger.expect(cond, message), tiger.log(...)'

const BODY_TYPES: BodyType[] = ['none', 'json', 'xml', 'text', 'form', 'graphql', 'multipart']

/** Format ids (json, xml, form...) are names; only "none" and "text" are words. */
function bodyTypeKey(bt: BodyType): MessageKey | undefined {
  if (bt === 'none') return 'request.body.typeNone'
  if (bt === 'text') return 'request.body.typeText'
  return undefined
}

export function RequestEditor({
  request,
  sending,
  diskBacked,
  dirty,
  missingVars,
  onChange,
  onImportCurl,
  onSend,
  onCancel,
  onSave,
  getBuilt,
  perf,
  showSection
}: Props) {
  const t = useT()
  const bodyTypeLabel = (bt: BodyType) => {
    const key = bodyTypeKey(bt)
    return key ? t(key) : bt
  }
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
    auth: { flag: hasAuth ? t('request.flag.set') : undefined },
    body: { flag: request.body.type !== 'none' ? bodyTypeLabel(request.body.type) : undefined },
    capture: { count: enabledCount(request.captures ?? []) },
    scripts: { flag: hasScripts ? t('request.flag.hasScripts') : undefined },
    docs: { flag: hasDocs ? t('request.flag.written') : undefined }
  }
  const tabDefs = REQUEST_SECTIONS.map((sec) => ({
    ...sec,
    label: sectionLabel(sec.id, t),
    description: sectionDescription(sec.id, t),
    ...state[sec.id]
  }))
  const current = tabDefs.find((sec) => sec.id === tab)!
  /** One-line explanation plus a guide link, for the less obvious sections. */
  const intro = (
    <p className="panel-intro" id={`${uid}-intro`}>
      <span>{current.description}</span>
      {'docs' in current && current.docs && <HelpLink page={current.docs} topic={current.label} />}
    </p>
  )
  const tabs = tablist(
    `${uid}-req`,
    tabDefs.map((sec) => sec.id),
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
    <section className="panel editor" aria-label={t('request.editor.label')}>
      <div className="name-row">
        <input
          className="req-name"
          value={request.name}
          spellCheck={false}
          placeholder={t('request.name.label')}
          aria-label={t('request.name.label')}
          title={request.name.length > 40 ? request.name : undefined}
          onChange={(e) => set({ name: e.target.value })}
        />
        {diskBacked && (
          <button
            type="button"
            className="icon-btn save-btn"
            title={dirty ? t('request.save.titleDirty', { action: actionTitle('save') }) : actionTitle('save')}
            aria-label={dirty ? t('request.save.labelDirty') : t('request.save.label')}
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
          aria-label={t('request.method.label')}
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
          aria-label={t('request.url.label')}
          aria-describedby={missingVars.length > 0 ? `${uid}-missing` : undefined}
          title={request.url.length > 60 ? request.url : undefined}
          onChange={(e) => set({ url: e.target.value })}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text')
            if (/^\s*curl(\s|$)/i.test(text)) {
              e.preventDefault()
              onImportCurl(text)
            }
          }}
          onKeyDown={(e) => {
            // Plain Enter only: Cmd/Ctrl+Enter is handled by the global
            // shortcut, and matching it here too would double-send.
            if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) onSend()
          }}
        />
        {sending ? (
          <button type="button" className="btn danger" onClick={onCancel} title={t('request.cancel.title')}>
            {t('common.cancel')}
          </button>
        ) : (
          <button type="button" className="btn accent" onClick={onSend} title={actionTitle('send')}>
            {t('request.send')}
          </button>
        )}
      </div>
      {missingVars.length > 0 && (
        <div className="warn-row" role="status" id={`${uid}-missing`}>
          {t('request.missing.text', { vars: missingVars.map((v) => `{{${v}}}`).join(' ') })}
          <span className="warn-hint">{t('request.missing.hint')}</span>
        </div>
      )}

      <div className="tabs" role="tablist" aria-label={t('request.sections.label')} onKeyDown={tabs.onKeyDown}>
        {tabDefs.map((sec) => {
          const detail = sec.count ? String(sec.count) : sec.flag
          const name = detail ? t('request.tab.withDetail', { label: sec.label, detail }) : sec.label
          return (
            <button
              key={sec.id}
              type="button"
              className={`tab ${tab === sec.id ? 'active' : ''}`}
              aria-label={name}
              title={sec.description}
              {...tabs.tab(sec.id)}
            >
              {sec.label}
              {sec.count ? (
                <>
                  {' '}
                  <span className="count" aria-hidden="true">
                    {sec.count}
                  </span>
                </>
              ) : sec.flag ? (
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
            placeholder={[t('request.param.name'), t('common.value')]}
            kind="param"
            onChange={(query) => set({ query })}
          />
        )}
        {tab === 'headers' && (
          <KeyValueEditor
            items={request.headers}
            placeholder={[t('request.header.name'), t('common.value')]}
            kind="header"
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
              <div className="seg" role="group" aria-label={t('request.body.type')}>
                {BODY_TYPES.map((bt) => (
                  <button
                    key={bt}
                    type="button"
                    className={request.body.type === bt ? 'on' : ''}
                    aria-pressed={request.body.type === bt}
                    onClick={() => set({ body: { ...request.body, type: bt } })}
                  >
                    {bodyTypeLabel(bt)}
                  </button>
                ))}
              </div>
              {bodyIsJson && request.body.content.trim() && (
                <>
                  {jsonInvalid && (
                    <span className="json-bad" id={`${uid}-json-bad`}>
                      {t('request.body.jsonInvalid')}
                    </span>
                  )}
                  <div className="body-toolbar-actions">
                    <button
                      type="button"
                      className="btn ghost body-tool"
                      title={t('request.body.formatTitle')}
                      onClick={() => {
                        const result = formatJsonText(request.body.content)
                        if (result.ok) set({ body: { ...request.body, content: result.formatted! } })
                      }}
                    >
                      {t('request.body.format')}
                    </button>
                    <button
                      type="button"
                      className="btn ghost body-tool"
                      title={t('request.body.minifyTitle')}
                      onClick={() => {
                        const result = minifyJsonText(request.body.content)
                        if (result.ok) set({ body: { ...request.body, content: result.formatted! } })
                      }}
                    >
                      {t('request.body.minify')}
                    </button>
                    <button
                      type="button"
                      className="icon-btn body-copy"
                      title={t('request.body.copy')}
                      aria-label={copiedBody ? t('request.body.copied') : t('request.body.copy')}
                      onClick={copyBody}
                    >
                      {copiedBody ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                    </button>
                  </div>
                </>
              )}
            </div>
            <span className="tg-sr-only" role="status" aria-live="polite">
              {copiedBody ? t('request.body.copiedStatus') : ''}
            </span>
            {request.body.type === 'none' && (
              <div className="body-empty">
                {t('request.body.empty')}
              </div>
            )}
            {request.body.type === 'form' && (
              <KeyValueEditor
                items={formRows}
                placeholder={[t('request.field.name'), t('common.value')]}
                kind="field"
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
                  {t('request.body.query')}
                </label>
                <textarea
                  id={`${uid}-gql-query`}
                  className="code-area gql-query"
                  spellCheck={false}
                  value={request.body.content}
                  // i18n-ignore: code sample
                  placeholder={'query {\n  viewer { id name }\n}'}
                  onChange={(e) => set({ body: { ...request.body, content: e.target.value } })}
                />
                <label className="gql-vars-label" htmlFor={`${uid}-gql-vars`}>
                  {t('request.body.variablesJson')}
                </label>
                <textarea
                  id={`${uid}-gql-vars`}
                  className="code-area gql-vars"
                  spellCheck={false}
                  value={request.body.variables ?? ''}
                  // i18n-ignore: code sample
                  placeholder={'{ "id": 1 }'}
                  onChange={(e) => set({ body: { ...request.body, variables: e.target.value } })}
                />
              </div>
            )}
            {(request.body.type === 'json' || request.body.type === 'xml' || request.body.type === 'text') && (
              <textarea
                className="code-area"
                spellCheck={false}
                aria-label={t('request.body.ariaLabel', { type: request.body.type.toUpperCase() })}
                aria-invalid={jsonInvalid || undefined}
                aria-describedby={jsonInvalid ? `${uid}-json-bad` : undefined}
                value={request.body.content}
                // i18n-ignore: code sample
                placeholder={
                  request.body.type === 'json'
                    ? '{\n  "name": "Ada",\n  "email": "ada@example.com"\n}'
                    : request.body.type === 'xml'
                      ? '<user>\n  <name>Ada</name>\n</user>'
                      : t('request.body.rawPlaceholder')
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
              placeholder={[t('request.variable.name'), 'body.data.id']}
              columns={[t('request.variable.name'), t('request.capture.readFrom')]}
              kind="capture"
              onChange={(captures) => set({ captures })}
            />
            <p className="cv-dim script-help">
              {t('request.capture.help', { example: '{{variable}}' })}
            </p>
          </>
        )}
        {tab === 'scripts' && (
          <div className="scripts-tab">
            {intro}
            <div className="script-block">
              <label className="script-label" htmlFor={`${uid}-pre`}>
                {t('request.scripts.pre')}
                <span className="cv-dim"> {t('request.scripts.preHint')}</span>
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
                {t('request.scripts.post')}
                <span className="cv-dim"> {t('request.scripts.postHint')}</span>
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
              {t('request.scripts.api', { calls: SCRIPT_API })}
            </div>
          </div>
        )}
        {tab === 'docs' && intro}
        {tab === 'docs' && (
          <textarea
            className="code-area"
            spellCheck={false}
            aria-label={t('request.docs.label')}
            value={request.docs ?? ''}
            placeholder={t('request.docs.placeholder')}
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
