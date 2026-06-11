import { useEffect, useState } from 'react'
import type { Settings, ThemeChoice } from '../../../main/settings'
import { Logo } from '../Logo'

interface Props {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
}

const THEMES: ThemeChoice[] = ['light', 'dark', 'system']

type SettingsTab = 'general' | 'network' | 'advanced' | 'privacy' | 'about'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'network', label: 'Network' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'about', label: 'About' }
]

export function SettingsView({ settings, onChange }: Props) {
  const [tab, setTab] = useState<SettingsTab>('general')
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.tiger?.version?.().then(setVersion)
  }, [])

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
                  className="num-input"
                  style={{ width: 240 }}
                  type="password"
                  value={settings.proxyPassword}
                  placeholder="password"
                  onChange={(e) => onChange({ proxyPassword: e.target.value })}
                />
              </div>
            </>
          )}
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
