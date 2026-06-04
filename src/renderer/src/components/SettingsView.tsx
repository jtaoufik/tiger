import type { Settings, ThemeChoice } from '../../../main/settings'
import { Logo } from '../Logo'

interface Props {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
}

const THEMES: ThemeChoice[] = ['light', 'dark', 'system']

export function SettingsView({ settings, onChange }: Props) {
  return (
    <section className="panel settings">
      <div className="settings-inner">
      <h2>Settings</h2>
      <div className="sub">Preferences are stored locally on this machine.</div>

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

      <div className="section-label">
        Network
      </div>

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
      )}

      <div className="section-label">
        Privacy
      </div>

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

      {settings.analyticsEnabled && (
        <>
          <div className="setting-row">
            <div>
              <div className="label">GA4 Measurement ID</div>
              <div className="desc">Your own GA4 stream (e.g. G-XXXXXXX). Leave blank to disable.</div>
            </div>
            <input
              className="num-input"
              style={{ width: 160 }}
              value={settings.measurementId ?? ''}
              onChange={(e) => onChange({ measurementId: e.target.value })}
            />
          </div>
          <div className="setting-row">
            <div>
              <div className="label">GA4 API secret</div>
              <div className="desc">Measurement Protocol API secret for the stream above.</div>
            </div>
            <input
              className="num-input"
              style={{ width: 160 }}
              type="password"
              value={settings.apiSecret ?? ''}
              onChange={(e) => onChange({ apiSecret: e.target.value })}
            />
          </div>
        </>
      )}

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
          <div style={{ fontSize: 12 }}>A free, local-first, open API client.</div>
        </div>
      </div>
      </div>
    </section>
  )
}
