import { useId } from 'react'
import type { TigerAuth } from '@core/types'
import { useT } from '../i18n'
import './AuthEditor.css'

interface Props {
  auth: TigerAuth | undefined
  /** undefined = inherit from the collection */
  onChange: (auth: TigerAuth | undefined) => void
  /** Hide the inherit option (used when editing the collection default itself). */
  noInherit?: boolean
}

function defaultFor(type: TigerAuth['type']): TigerAuth {
  switch (type) {
    case 'bearer':
      return { type: 'bearer', token: '' }
    case 'basic':
      return { type: 'basic', username: '', password: '' }
    case 'apikey':
      return { type: 'apikey', key: '', value: '', in: 'header' }
    case 'oauth2':
      return {
        type: 'oauth2',
        grantType: 'client_credentials',
        tokenUrl: '',
        clientId: '',
        clientSecret: '',
        scope: ''
      }
    default:
      return { type: 'none' }
  }
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  hint
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  hint?: string
}) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        spellCheck={false}
        autoComplete="off"
        placeholder={placeholder}
        title={type !== 'password' && value.length > 40 ? value : undefined}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && (
        <div id={`${id}-hint`} className="auth-hint">
          {hint}
        </div>
      )}
    </div>
  )
}

export function AuthEditor({ auth, onChange, noInherit }: Props) {
  const current: TigerAuth = auth ?? { type: 'none' }
  const selected = auth ? auth.type : noInherit ? 'none' : 'inherit'
  const uid = useId()
  const t = useT()

  return (
    <div className="auth-editor">
      <div className="field">
        <label htmlFor={`${uid}-type`}>{t('request.auth.type')}</label>
        <select
          id={`${uid}-type`}
          value={selected}
          onChange={(e) => {
            const v = e.target.value
            onChange(v === 'inherit' ? undefined : defaultFor(v as TigerAuth['type']))
          }}
        >
          {!noInherit && <option value="inherit">{t('request.auth.inherit')}</option>}
          <option value="none">{t('request.auth.none')}</option>
          <option value="bearer">{t('request.auth.bearer')}</option>
          <option value="basic">{t('request.auth.basic')}</option>
          <option value="apikey">{t('request.auth.apikey')}</option>
          <option value="oauth2">{t('request.auth.oauth2')}</option>
        </select>
      </div>

      {selected === 'inherit' && (
        <div className="auth-note">
          {t('request.auth.noteInherit')}
        </div>
      )}
      {selected === 'none' && (
        <div className="auth-note">{t('request.auth.noteNone')}</div>
      )}

      {auth && current.type === 'bearer' && (
        <Field
          label={t('request.auth.token')}
          value={current.token}
          placeholder={t('request.auth.tokenPlaceholder', { example: '{{token}}' })}
          hint={t('request.auth.tokenHint')}
          onChange={(v) => onChange({ ...current, token: v })}
        />
      )}

      {current.type === 'basic' && (
        <div className="row-2">
          <Field
            label={t('request.auth.username')}
            value={current.username}
            onChange={(v) => onChange({ ...current, username: v })}
          />
          <Field
            label={t('request.auth.password')}
            type="password"
            value={current.password}
            onChange={(v) => onChange({ ...current, password: v })}
          />
        </div>
      )}

      {current.type === 'apikey' && (
        <>
          <div className="row-2">
            <Field
              label={t('request.auth.key')}
              value={current.key}
              // i18n-ignore: header name / scope example
              placeholder="X-API-Key"
              onChange={(v) => onChange({ ...current, key: v })}
            />
            <Field
              label={t('request.auth.value')}
              placeholder="{{apiKey}}"
              value={current.value}
              onChange={(v) => onChange({ ...current, value: v })}
            />
          </div>
          <div className="field">
            <label htmlFor={`${uid}-in`}>{t('request.auth.addTo')}</label>
            <select
              id={`${uid}-in`}
              value={current.in}
              onChange={(e) => onChange({ ...current, in: e.target.value as 'header' | 'query' })}
            >
              <option value="header">{t('request.auth.inHeader')}</option>
              <option value="query">{t('request.auth.inQuery')}</option>
            </select>
          </div>
        </>
      )}

      {current.type === 'oauth2' && (
        <>
          <Field
            label={t('request.auth.tokenUrl')}
            placeholder="https://auth.example.com/oauth/token"
            value={current.tokenUrl}
            onChange={(v) => onChange({ ...current, tokenUrl: v })}
          />
          <div className="row-2">
            <Field
              label={t('request.auth.clientId')}
              value={current.clientId}
              onChange={(v) => onChange({ ...current, clientId: v })}
            />
            <Field
              label={t('request.auth.clientSecret')}
              type="password"
              value={current.clientSecret}
              onChange={(v) => onChange({ ...current, clientSecret: v })}
            />
          </div>
          <Field
            label={t('request.auth.scope')}
            // i18n-ignore: header name / scope example
            placeholder="read:users write:users"
            hint={t('request.auth.scopeHint')}
            value={current.scope}
            onChange={(v) => onChange({ ...current, scope: v })}
          />
        </>
      )}
    </div>
  )
}
