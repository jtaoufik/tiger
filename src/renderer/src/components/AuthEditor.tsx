import type { TigerAuth } from '@core/types'

interface Props {
  auth: TigerAuth | undefined
  onChange: (auth: TigerAuth) => void
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
  type = 'text'
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type={type} value={value} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export function AuthEditor({ auth, onChange }: Props) {
  const current: TigerAuth = auth ?? { type: 'none' }

  return (
    <div>
      <div className="field">
        <label>Type</label>
        <select
          value={current.type}
          onChange={(e) => onChange(defaultFor(e.target.value as TigerAuth['type']))}
        >
          <option value="none">No Auth</option>
          <option value="bearer">Bearer Token</option>
          <option value="basic">Basic Auth</option>
          <option value="apikey">API Key</option>
          <option value="oauth2">OAuth 2.0 — Client Credentials</option>
        </select>
      </div>

      {current.type === 'none' && (
        <div style={{ color: 'var(--text-dim)' }}>This request sends no authentication.</div>
      )}

      {current.type === 'bearer' && (
        <Field label="Token" value={current.token} onChange={(v) => onChange({ ...current, token: v })} />
      )}

      {current.type === 'basic' && (
        <div className="row-2">
          <Field
            label="Username"
            value={current.username}
            onChange={(v) => onChange({ ...current, username: v })}
          />
          <Field
            label="Password"
            type="password"
            value={current.password}
            onChange={(v) => onChange({ ...current, password: v })}
          />
        </div>
      )}

      {current.type === 'apikey' && (
        <>
          <div className="row-2">
            <Field label="Key" value={current.key} onChange={(v) => onChange({ ...current, key: v })} />
            <Field
              label="Value"
              value={current.value}
              onChange={(v) => onChange({ ...current, value: v })}
            />
          </div>
          <div className="field">
            <label>Add to</label>
            <select
              value={current.in}
              onChange={(e) => onChange({ ...current, in: e.target.value as 'header' | 'query' })}
            >
              <option value="header">Header</option>
              <option value="query">Query parameter</option>
            </select>
          </div>
        </>
      )}

      {current.type === 'oauth2' && (
        <>
          <Field
            label="Access Token URL"
            value={current.tokenUrl}
            onChange={(v) => onChange({ ...current, tokenUrl: v })}
          />
          <div className="row-2">
            <Field
              label="Client ID"
              value={current.clientId}
              onChange={(v) => onChange({ ...current, clientId: v })}
            />
            <Field
              label="Client Secret"
              type="password"
              value={current.clientSecret}
              onChange={(v) => onChange({ ...current, clientSecret: v })}
            />
          </div>
          <Field label="Scope" value={current.scope} onChange={(v) => onChange({ ...current, scope: v })} />
        </>
      )}
    </div>
  )
}
