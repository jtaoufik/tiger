import { useId, useState } from 'react'
import { requestBadge, type MessageFormat, type SavedMessage, type TigerRequest } from '@core/types'
import { formatJsonText, isValidJson } from '@core/jsonHighlight'
import { sectionLabel } from '@core/actions'
import { useT } from '../i18n'
import { actionTitle } from '../actions'
import { announce } from '../a11y'
import { draftFor, setDraft, useConnection } from '../realtime'
import { KeyValueEditor } from './KeyValueEditor'
import { AuthEditor } from './AuthEditor'
import { PencilIcon, PlugIcon, SaveIcon, SendIcon, TrashIcon, UnplugIcon } from './Icons'
import { tablist } from './tablist'
import './a11y.css'
import './RequestEditor.css'
import './Realtime.css'

interface Props {
  /** The request id: also the connection id. */
  id: string
  request: TigerRequest
  diskBacked: boolean
  dirty: boolean
  missingVars: string[]
  onChange: (request: TigerRequest) => void
  onSave: () => void
  /** Connect when closed, disconnect when open (the `connect` action). */
  onToggleConnection: () => void
  /** Send a message on the open WebSocket. */
  onSendMessage: (text: string) => void
}

type Tab = 'message' | 'saved' | 'protocols' | 'headers' | 'params' | 'auth' | 'docs'

const WS_TABS: Tab[] = ['message', 'saved', 'protocols', 'headers', 'params', 'auth', 'docs']
const SSE_TABS: Tab[] = ['headers', 'params', 'auth', 'docs']

/**
 * The editor of a WebSocket or Server-Sent Events request: the address and
 * Connect, then sections for the message composer, saved messages,
 * subprotocols, headers, query, auth and notes. The timeline is
 * RealtimeTimeline, under it.
 */
export function RealtimeEditor({
  id,
  request,
  diskBacked,
  dirty,
  missingVars,
  onChange,
  onSave,
  onToggleConnection,
  onSendMessage
}: Props) {
  const t = useT()
  const uid = useId()
  const isWs = request.kind === 'ws'
  const tabIds = isWs ? WS_TABS : SSE_TABS
  const [tab, setTab] = useState<Tab>(tabIds[0])
  const current = tabIds.includes(tab) ? tab : tabIds[0]
  const connection = useConnection(id)
  const live = connection.status === 'open' || connection.status === 'connecting' || connection.status === 'reconnecting'
  const open = connection.status === 'open'
  const [draft, setDraftState] = useState(() => draftFor(id))
  const [format, setFormat] = useState<MessageFormat>(() => (isValidJson(draftFor(id)) ? 'json' : 'text'))
  const [protocolsText, setProtocolsText] = useState(() => (request.subprotocols ?? []).join('\n'))

  const set = (patch: Partial<TigerRequest>) => onChange({ ...request, ...patch })
  const updateDraft = (text: string) => {
    setDraftState(text)
    setDraft(id, text)
  }
  const messages = request.messages ?? []
  const setMessages = (next: SavedMessage[]) => set({ messages: next })

  const tabLabel = (tabId: Tab): string => {
    switch (tabId) {
      case 'message':
        return t('realtime.tab.message')
      case 'saved':
        return t('realtime.tab.saved')
      case 'protocols':
        return t('realtime.tab.protocols')
      default:
        return sectionLabel(tabId, t)
    }
  }
  const tabCount = (tabId: Tab): number => {
    if (tabId === 'saved') return messages.length
    if (tabId === 'protocols') return (request.subprotocols ?? []).filter(Boolean).length
    if (tabId === 'headers') return request.headers.filter((h) => h.enabled !== false && h.name).length
    if (tabId === 'params') return request.query.filter((q) => q.enabled !== false && q.name).length
    return 0
  }
  const tabs = tablist(`${uid}-rt`, tabIds, current, setTab)

  const jsonInvalid =
    format === 'json' && !!draft.trim() && !draft.includes('{{') && draft.length < 100000 && !isValidJson(draft)

  const send = (text: string) => {
    if (!open) return announce(t('realtime.send.offline'))
    onSendMessage(text)
  }

  const saveDraft = () => {
    if (!draft.trim()) return
    const name = t('realtime.message.defaultName', { n: messages.length + 1 })
    setMessages([...messages, { name, format, content: draft }])
    announce(t('realtime.saveMessage.done', { name }))
  }

  const statusText = t(`realtime.status.${connection.status}`)

  return (
    <section className="panel editor rt-editor" aria-label={t(isWs ? 'realtime.editor.ws' : 'realtime.editor.sse')}>
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
        <span
          className={`rt-kind method-pill m-${request.kind}`}
          title={t(isWs ? 'realtime.editor.ws' : 'realtime.editor.sse')}
        >
          {requestBadge(request)}
        </span>
        <input
          className="url-input"
          spellCheck={false}
          value={request.url}
          // i18n-ignore: example address
          placeholder={isWs ? 'wss://echo.example.com/socket' : 'https://api.example.com/events'}
          aria-label={t('realtime.url.label')}
          aria-describedby={missingVars.length > 0 ? `${uid}-missing` : undefined}
          title={request.url.length > 60 ? request.url : undefined}
          onChange={(e) => set({ url: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey && !live) onToggleConnection()
          }}
        />
        <span className={`rt-status rt-status-${connection.status}`} aria-hidden="true" title={statusText}>
          <span className="rt-dot" />
        </span>
        <button
          type="button"
          className={live ? 'btn danger rt-connect' : 'btn accent rt-connect'}
          title={actionTitle('connect')}
          onClick={onToggleConnection}
        >
          {live ? <UnplugIcon size={14} /> : <PlugIcon size={14} />}
          {live ? t('realtime.disconnect') : t('realtime.connect')}
        </button>
      </div>
      {missingVars.length > 0 && (
        <div className="warn-row" role="status" id={`${uid}-missing`}>
          {t('request.missing.text', { vars: missingVars.map((v) => `{{${v}}}`).join(' ') })}
          <span className="warn-hint">{t('request.missing.hint')}</span>
        </div>
      )}
      {!isWs && (
        <div className="rt-options">
          <label className="rt-check">
            <input
              type="checkbox"
              checked={request.reconnect === true}
              aria-describedby={`${uid}-reconnect-hint`}
              onChange={(e) => set({ reconnect: e.target.checked })}
            />
            {t('realtime.reconnect.label')}
          </label>
          <span className="cv-dim" id={`${uid}-reconnect-hint`}>
            {t('realtime.reconnect.hint')}
          </span>
        </div>
      )}

      <div className="tabs" role="tablist" aria-label={t('realtime.sections.label')} onKeyDown={tabs.onKeyDown}>
        {tabIds.map((tabId) => {
          const count = tabCount(tabId)
          const label = tabLabel(tabId)
          return (
            <button
              key={tabId}
              type="button"
              className={`tab ${current === tabId ? 'active' : ''}`}
              aria-label={count ? t('request.tab.withDetail', { label, detail: String(count) }) : label}
              {...tabs.tab(tabId)}
            >
              {label}
              {count ? (
                <>
                  {' '}
                  <span className="count" aria-hidden="true">
                    {count}
                  </span>
                </>
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="tab-body" {...tabs.panel()}>
        {current === 'message' && (
          <div className="body-pane rt-composer">
            <div className="body-toolbar">
              <div className="seg" role="group" aria-label={t('realtime.format.label')}>
                {(['text', 'json'] as const).map((f) => (
                  <button key={f} type="button" className={format === f ? 'on' : ''} aria-pressed={format === f} onClick={() => setFormat(f)}>
                    {t(f === 'text' ? 'realtime.format.text' : 'realtime.format.json')}
                  </button>
                ))}
              </div>
              {jsonInvalid && (
                <span className="json-bad" id={`${uid}-json-bad`}>
                  {t('realtime.json.invalid')}
                </span>
              )}
              <div className="body-toolbar-actions">
                {format === 'json' && (
                  <button
                    type="button"
                    className="btn ghost body-tool"
                    title={t('realtime.prettify.title')}
                    onClick={() => {
                      const result = formatJsonText(draft)
                      if (result.ok) updateDraft(result.formatted!)
                    }}
                  >
                    {t('realtime.prettify')}
                  </button>
                )}
                <button type="button" className="btn ghost body-tool" title={t('realtime.saveMessage.title')} onClick={saveDraft}>
                  {t('realtime.saveMessage')}
                </button>
                <button
                  type="button"
                  className="btn accent body-tool rt-send"
                  aria-disabled={!open || undefined}
                  title={open ? actionTitle('send') : t('realtime.send.offline')}
                  onClick={() => send(draft)}
                >
                  <SendIcon size={14} /> {t('realtime.send')}
                </button>
              </div>
            </div>
            <textarea
              className="code-area rt-draft"
              spellCheck={false}
              aria-label={t('realtime.composer.label')}
              aria-invalid={jsonInvalid || undefined}
              aria-describedby={jsonInvalid ? `${uid}-json-bad` : undefined}
              placeholder={t('realtime.composer.placeholder')}
              value={draft}
              onChange={(e) => updateDraft(e.target.value)}
            />
          </div>
        )}
        {current === 'saved' &&
          (messages.length === 0 ? (
            <div className="body-empty">{t('realtime.saved.empty')}</div>
          ) : (
            <ul className="rt-saved" aria-label={t('realtime.tab.saved')}>
              {messages.map((m, i) => (
                <li key={i} className="rt-saved-row">
                  <input
                    className="rt-saved-name"
                    value={m.name}
                    spellCheck={false}
                    aria-label={t('realtime.saved.name')}
                    onChange={(e) => setMessages(messages.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  />
                  <span className="rt-saved-format" aria-hidden="true">
                    {t(m.format === 'json' ? 'realtime.format.json' : 'realtime.format.text')}
                  </span>
                  <code className="rt-saved-preview" title={m.content.length > 80 ? m.content : undefined}>
                    {m.content.replace(/\s+/g, ' ').slice(0, 120)}
                  </code>
                  <button
                    type="button"
                    className="btn accent body-tool"
                    aria-label={t('realtime.saved.sendNamed', { name: m.name })}
                    aria-disabled={!open || undefined}
                    title={open ? undefined : t('realtime.send.offline')}
                    onClick={() => send(m.content)}
                  >
                    <SendIcon size={14} /> {t('realtime.send')}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('realtime.saved.editNamed', { name: m.name })}
                    title={t('realtime.saved.edit')}
                    onClick={() => {
                      updateDraft(m.content)
                      setFormat(m.format)
                      setTab('message')
                    }}
                  >
                    <PencilIcon size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('realtime.saved.removeNamed', { name: m.name })}
                    title={t('realtime.saved.removeNamed', { name: m.name })}
                    onClick={() => setMessages(messages.filter((_, j) => j !== i))}
                  >
                    <TrashIcon size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ))}
        {current === 'protocols' && (
          <div className="rt-protocols">
            <label className="script-label" htmlFor={`${uid}-protocols`}>
              {t('realtime.protocols.label')}
            </label>
            <textarea
              id={`${uid}-protocols`}
              className="code-area"
              spellCheck={false}
              aria-describedby={`${uid}-protocols-hint`}
              value={protocolsText}
              // i18n-ignore: protocol names
              placeholder={'graphql-transport-ws\nv1.json.example'}
              onChange={(e) => {
                setProtocolsText(e.target.value)
                set({ subprotocols: e.target.value.split('\n').map((p) => p.trim()).filter(Boolean) })
              }}
            />
            <p className="cv-dim script-help" id={`${uid}-protocols-hint`}>
              {t('realtime.protocols.hint')}
            </p>
          </div>
        )}
        {current === 'headers' && (
          <>
            {!isWs && <p className="panel-intro">{t('realtime.sse.hint')}</p>}
            <KeyValueEditor
              items={request.headers}
              placeholder={[t('request.header.name'), t('common.value')]}
              kind="header"
              onChange={(headers) => set({ headers })}
            />
          </>
        )}
        {current === 'params' && (
          <KeyValueEditor
            items={request.query}
            placeholder={[t('request.param.name'), t('common.value')]}
            kind="param"
            onChange={(query) => set({ query })}
          />
        )}
        {current === 'auth' && <AuthEditor auth={request.auth} onChange={(auth) => set({ auth })} />}
        {current === 'docs' && (
          <textarea
            className="code-area"
            spellCheck={false}
            aria-label={t('request.docs.label')}
            value={request.docs ?? ''}
            placeholder={t('request.docs.placeholder')}
            onChange={(e) => set({ docs: e.target.value })}
          />
        )}
      </div>
    </section>
  )
}
