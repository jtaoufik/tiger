import { useEffect, useRef, useState } from 'react'
import type { Settings, ThemeChoice } from '../../../main/settings'
import { Logo } from '../Logo'
import { CheckIcon, CloseIcon, CopyIcon } from './Icons'
import './SettingsExtras.css'

interface Props {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
}

const THEMES: ThemeChoice[] = ['light', 'dark', 'system']

type SettingsTab = 'general' | 'network' | 'advanced' | 'mcp' | 'privacy' | 'about'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'network', label: 'Network' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'mcp', label: 'MCP' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'about', label: 'About' }
]

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() ?? p
}

interface FileRowProps {
  label: string
  value: string
  filters: { name: string; extensions: string[] }[]
  onChange: (v: string) => void
}

function FileRow({ label, value, filters, onChange }: FileRowProps) {
  async function pick() {
    const path = await window.tiger?.pickFile(filters)
    if (path != null) onChange(path)
  }
  function clear() {
    onChange('')
  }
  return (
    <div className="setting-row">
      <div style={{ flex: '0 0 160px', minWidth: 0 }}>
        <div className="label">{label}</div>
      </div>
      <div className="cert-row" style={{ flex: 1, minWidth: 0 }}>
        <span className={`cert-row-label${value ? '' : ' placeholder'}`}>
          {value ? basename(value) : 'Not set'}
        </span>
        <button className="cert-pick-btn" onClick={pick}>
          Choose file
        </button>
        {value && (
          <button className="cert-clear-btn" onClick={clear} title="Clear">
            <CloseIcon size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

export function SettingsView({ settings, onChange }: Props) {
  const [tab, setTab] = useState<SettingsTab>('general')
  const [version, setVersion] = useState('')
  const [clearLabel, setClearLabel] = useState('Clear cookies')
  const [mcpServerPath, setMcpServerPath] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Local mirrors for password inputs so they only commit on blur/Enter
  const [localPassphrase, setLocalPassphrase] = useState(settings.certPassphrase)
  const [localProxyPassword, setLocalProxyPassword] = useState(settings.proxyPassword)
  const passphraseRef = useRef<HTMLInputElement>(null)
  const proxyPasswordRef = useRef<HTMLInputElement>(null)

  // Sync local mirrors when settings change externally
  useEffect(() => {
    setLocalPassphrase(settings.certPassphrase)
  }, [settings.certPassphrase])

  useEffect(() => {
    setLocalProxyPassword(settings.proxyPassword)
  }, [settings.proxyPassword])

  useEffect(() => {
    window.tiger?.version?.().then(setVersion)
  }, [])

  useEffect(() => {
    if (tab === 'mcp') {
      window.tiger?.mcpInfo?.().then((info) => setMcpServerPath(info.serverPath))
    }
  }, [tab])

  function handleClearCookies() {
    window.tiger?.clearCookies?.().then(() => {
      setClearLabel('Cleared')
      setTimeout(() => setClearLabel('Clear cookies'), 1200)
    })
  }

  const mcpSnippet = mcpServerPath
    ? JSON.stringify(
        {
          mcpServers: {
            tiger: {
              command: 'node',
              args: [mcpServerPath, '<path to your collection folder>']
            }
          }
        },
        null,
        2
      )
    : null

  function handleCopyMcp() {
    if (!mcpSnippet) return
    navigator.clipboard.writeText(mcpSnippet).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <section className="panel settings">
      <div className="settings-inner">
      <h2>Settings</h2>
      <div className="sub">Preferences are stored locally on this machine.</div>

      <div className="seg settings-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <>
          <div className="setting-row">
            <div>
              <div className="label">Appearance</div>
              <div className="desc">Light glass, dark glass, or follow the system.</div>
            </div>
            <div className="seg">
              {THEMES.map((t) => (
                <button
                  key={t}
                  className={settings.theme === t ? 'on' : ''}
                  onClick={() => onChange({ theme: t })}
                >
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="setting-row">
            <div>
              <div className="label">Request timeout</div>
              <div className="desc">How long to wait before giving up, in milliseconds.</div>
            </div>
            <input
              className="num-input"
              type="number"
              min={1000}
              step={1000}
              value={settings.timeoutMs}
              onChange={(e) => onChange({ timeoutMs: Number(e.target.value) || 30000 })}
            />
          </div>

          <div className="setting-row">
            <div>
              <div className="label">Editor font size</div>
              <div className="desc">Size of the monospace text in editors and the response.</div>
            </div>
            <input
              className="num-input"
              type="number"
              min={10}
              max={22}
              value={settings.fontSize}
              onChange={(e) => onChange({ fontSize: Number(e.target.value) || 13 })}
            />
          </div>
        </>
      )}

      {tab === 'network' && (
        <>
          <div className="setting-row">
            <div>
              <div className="label">Follow redirects</div>
              <div className="desc">Automatically follow 3xx responses to their target.</div>
            </div>
            <button
              className={`switch ${settings.followRedirects ? 'on' : ''}`}
              role="switch"
              aria-checked={settings.followRedirects}
              aria-label="Follow redirects"
              onClick={() => onChange({ followRedirects: !settings.followRedirects })}
            >
              <span className="knob" />
            </button>
          </div>

          <div className="setting-row">
            <div>
              <div className="label">Verify SSL certificates</div>
              <div className="desc">Turn off to allow self-signed certificates (development only).</div>
            </div>
            <button
              className={`switch ${settings.sslVerify ? 'on' : ''}`}
              role="switch"
              aria-checked={settings.sslVerify}
              aria-label="Verify SSL certificates"
              onClick={() => onChange({ sslVerify: !settings.sslVerify })}
            >
              <span className="knob" />
            </button>
          </div>

          <div className="setting-row">
            <div>
              <div className="label">Use a proxy</div>
              <div className="desc">Route all requests through an HTTP/HTTPS or SOCKS proxy.</div>
            </div>
            <button
              className={`switch ${settings.proxyEnabled ? 'on' : ''}`}
              role="switch"
              aria-checked={settings.proxyEnabled}
              aria-label="Use a proxy"
              onClick={() => onChange({ proxyEnabled: !settings.proxyEnabled })}
            >
              <span className="knob" />
            </button>
          </div>

          {settings.proxyEnabled && (
            <>
              <div className="setting-row">
                <div>
                  <div className="label">Proxy URL</div>
                  <div className="desc">e.g. http://127.0.0.1:8080 or socks5://127.0.0.1:1080</div>
                </div>
                <input
                  className="num-input"
                  style={{ width: 240 }}
                  value={settings.proxyUrl}
                  placeholder="http://host:port"
                  onChange={(e) => onChange({ proxyUrl: e.target.value })}
                />
              </div>

              <div className="setting-row">
                <div>
                  <div className="label">Proxy username</div>
                  <div className="desc">
                    Sent when the proxy asks for authentication. Leave blank for none.
                  </div>
                </div>
                <input
                  className="num-input"
                  style={{ width: 240 }}
                  value={settings.proxyUsername}
                  placeholder="username"
                  spellCheck={false}
                  onChange={(e) => onChange({ proxyUsername: e.target.value })}
                />
              </div>

              <div className="setting-row">
                <div>
                  <div className="label">Proxy password</div>
                  <div className="desc">Stored locally on this machine, never synced.</div>
                </div>
                <input
                  ref={proxyPasswordRef}
                  className="num-input"
                  style={{ width: 240 }}
                  type="password"
                  value={localProxyPassword}
                  placeholder="password"
                  onChange={(e) => setLocalProxyPassword(e.target.value)}
                  onBlur={() => onChange({ proxyPassword: localProxyPassword })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onChange({ proxyPassword: localProxyPassword })
                      proxyPasswordRef.current?.blur()
                    }
                  }}
                />
              </div>
            </>
          )}

          <div className="setting-row">
            <div>
              <div className="label">Persistent cookie jar</div>
              <div className="desc">
                Store cookies between sends and sessions. Cookies are saved locally and
                replayed on subsequent requests to matching domains.
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                className={`switch ${settings.cookieJarEnabled ? 'on' : ''}`}
                role="switch"
                aria-checked={settings.cookieJarEnabled}
                aria-label="Persistent cookie jar"
                onClick={() => onChange({ cookieJarEnabled: !settings.cookieJarEnabled })}
              >
                <span className="knob" />
              </button>
              <button className="cookie-clear-btn" onClick={handleClearCookies}>
                {clearLabel}
              </button>
            </div>
          </div>
        </>
      )}

      {tab === 'advanced' && (
        <>
          <div className="setting-row">
            <div>
              <div className="label">Certificate exceptions</div>
              <div className="desc">
                Hostnames (comma-separated) where invalid or internal certificates are accepted,
                for example intranet.acme.local. Safer than turning verification off globally.
              </div>
            </div>
            <input
              className="num-input"
              style={{ width: 240 }}
              value={settings.certExceptions}
              placeholder="host1, host2"
              spellCheck={false}
              onChange={(e) => onChange({ certExceptions: e.target.value })}
            />
          </div>

          <div className="setting-row">
            <div>
              <div className="label">Maximum redirects</div>
              <div className="desc">Upper bound when following 3xx responses.</div>
            </div>
            <input
              className="num-input"
              type="number"
              min={0}
              max={20}
              value={settings.maxRedirects}
              onChange={(e) => onChange({ maxRedirects: Number(e.target.value) || 5 })}
            />
          </div>

          <div className="setting-row">
            <div>
              <div className="label">Client certificate subject filter</div>
              <div className="desc">
                When a server requests a client certificate, pick the one whose subject contains
                this text
              </div>
            </div>
            <input
              className="num-input"
              style={{ width: 240 }}
              value={settings.clientCertSubject}
              placeholder="e.g. CN=alice"
              spellCheck={false}
              onChange={(e) => onChange({ clientCertSubject: e.target.value })}
            />
          </div>

          <div className="settings-group-label" data-testid="certificates-group">Certificates</div>

          <FileRow
            label="CA bundle (PEM)"
            value={settings.caFile}
            filters={[{ name: 'PEM Certificate', extensions: ['pem', 'crt', 'cer'] }]}
            onChange={(v) => onChange({ caFile: v })}
          />

          <FileRow
            label="Client certificate (PEM)"
            value={settings.clientCertFile}
            filters={[{ name: 'PEM Certificate', extensions: ['pem', 'crt', 'cer'] }]}
            onChange={(v) => onChange({ clientCertFile: v })}
          />

          <FileRow
            label="Client key (PEM)"
            value={settings.clientKeyFile}
            filters={[{ name: 'PEM Key', extensions: ['pem', 'key'] }]}
            onChange={(v) => onChange({ clientKeyFile: v })}
          />

          <FileRow
            label="PFX / P12 bundle"
            value={settings.clientPfxFile}
            filters={[{ name: 'PFX / P12 Bundle', extensions: ['pfx', 'p12'] }]}
            onChange={(v) => onChange({ clientPfxFile: v })}
          />

          <div className="setting-row">
            <div style={{ flex: '0 0 160px', minWidth: 0 }}>
              <div className="label">Certificate passphrase</div>
            </div>
            <input
              ref={passphraseRef}
              className="num-input"
              style={{ width: 240 }}
              type="password"
              value={localPassphrase}
              placeholder="passphrase"
              onChange={(e) => setLocalPassphrase(e.target.value)}
              onBlur={() => onChange({ certPassphrase: localPassphrase })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onChange({ certPassphrase: localPassphrase })
                  passphraseRef.current?.blur()
                }
              }}
            />
          </div>

          <p className="cert-hint">
            Requests using imported certificates bypass the proxy.
          </p>
        </>
      )}

      {tab === 'mcp' && (
        <>
          <p className="mcp-intro">
            Tiger ships a built-in MCP server that exposes your collections to Claude Desktop
            and other MCP-compatible clients. Add the snippet below to your{' '}
            <code>claude_desktop_config.json</code> to connect.
          </p>

          {mcpSnippet ? (
            <div className="mcp-code-block-wrap">
              <code className="mcp-code-block">{mcpSnippet}</code>
              <button className="mcp-copy-btn" onClick={handleCopyMcp} title="Copy snippet">
                {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          ) : (
            <div className="mcp-code-block-wrap">
              <code className="mcp-code-block">Loading…</code>
            </div>
          )}

          <p className="mcp-note">
            Replace <code>&lt;path to your collection folder&gt;</code> with the absolute path to
            the folder you opened in Tiger. You can have multiple entries — one per collection.
          </p>
        </>
      )}

      {tab === 'privacy' && (
        <div className="setting-row">
          <div>
            <div className="label">Anonymous usage analytics</div>
            <div className="desc">
              On by default. Sends anonymous, aggregate events only (never URLs, headers or bodies).
              Turn off anytime.
            </div>
          </div>
          <button
            className={`switch ${settings.analyticsEnabled ? 'on' : ''}`}
            role="switch"
            aria-checked={settings.analyticsEnabled}
            aria-label="Analytics"
            onClick={() => onChange({ analyticsEnabled: !settings.analyticsEnabled })}
          >
            <span className="knob" />
          </button>
        </div>
      )}

      {tab === 'about' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginTop: 26,
            color: 'var(--text-dim)'
          }}
        >
          <Logo size={34} rounded />
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text)' }}>Tiger</div>
            <div style={{ fontSize: 12 }}>A local-first API client for teams.</div>
            {version && <div style={{ fontSize: 12 }}>Version {version}</div>}
          </div>
        </div>
      )}
      </div>
    </section>
  )
}
