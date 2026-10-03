import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { Settings, ThemeChoice } from '../../../main/settings'
import { mcpClientConfig, type McpInfo } from '../../../mcp/launch'
import { Logo } from '../Logo'
import { CheckIcon, CloseIcon, CopyIcon } from './Icons'
import './SettingsExtras.css'
import { announce, rovingIndex } from '../a11y'
import type { DocsPage } from '@core/actions'
import { HelpLink } from './HelpLink'
import {
  LOCALE_NATIVE_NAMES,
  SUPPORTED_LOCALES,
  isLanguageChoice,
  textDirection,
  type LanguageChoice,
  type MessageKey
} from '@core/i18n'
import { useT } from '../i18n'

interface Props {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
}

const THEMES: ThemeChoice[] = ['light', 'dark', 'system']
const THEME_KEYS: Record<ThemeChoice, MessageKey> = {
  light: 'settings.theme.light',
  dark: 'settings.theme.dark',
  system: 'settings.theme.system'
}

type SettingsTab = 'general' | 'network' | 'advanced' | 'mcp' | 'privacy' | 'about'

/** Each section says in one line what it is for, so nobody opens six tabs to find a setting. */
export const TABS: { id: SettingsTab; labelKey: MessageKey; introKey: MessageKey; docs?: DocsPage }[] = [
  { id: 'general', labelKey: 'settings.tabs.general.label', introKey: 'settings.tabs.general.intro' },
  { id: 'network', labelKey: 'settings.tabs.network.label', introKey: 'settings.tabs.network.intro' },
  { id: 'advanced', labelKey: 'settings.tabs.advanced.label', introKey: 'settings.tabs.advanced.intro' },
  {
    id: 'mcp',
    labelKey: 'settings.tabs.mcp.label',
    introKey: 'settings.tabs.mcp.intro',
    docs: 'mcp'
  },
  { id: 'privacy', labelKey: 'settings.tabs.privacy.label', introKey: 'settings.tabs.privacy.intro' },
  { id: 'about', labelKey: 'settings.tabs.about.label', introKey: 'settings.tabs.about.intro' }
]

/** Splits a translated sentence at a sentinel so a node (code, link) can sit inside it. */
const SLOT = ''
function withNode(text: string, node: ReactNode): ReactNode {
  const [before, ...rest] = text.split(SLOT)
  if (rest.length === 0) return text
  return (
    <>
      {before}
      {node}
      {rest.join(SLOT)}
    </>
  )
}

function basename(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() ?? p
}

interface FileRowProps {
  label: string
  desc: string
  value: string
  filters: { name: string; extensions: string[] }[]
  onChange: (v: string) => void
}

function FileRow({ label, desc, value, filters, onChange }: FileRowProps) {
  const t = useT()
  async function pick() {
    const path = await window.tiger?.pickFile(filters)
    if (path != null) onChange(path)
  }
  function clear() {
    onChange('')
  }
  return (
    <div className="setting-row">
      <div style={{ flex: '0 0 200px', minWidth: 0 }}>
        <div className="label">{label}</div>
        <div className="desc">{desc}</div>
      </div>
      <div className="cert-row" style={{ flex: 1, minWidth: 0 }}>
        <span
          className={`cert-row-label${value ? '' : ' placeholder'}`}
          title={value || undefined}
        >
          {value ? basename(value) : t('settings.files.notSet')}
        </span>
        <button
          type="button"
          className="cert-pick-btn"
          onClick={pick}
          aria-label={t('settings.files.chooseAria', { label })}
        >
          {t('settings.files.choose')}
        </button>
        {value && (
          <button
            type="button"
            className="cert-clear-btn"
            onClick={clear}
            title={t('settings.files.clear')}
            aria-label={t('settings.files.clearAria', { label })}
          >
            <CloseIcon size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Settings > General > Language. Each language is written in its own name
 * (and tagged with its lang, so screen readers pronounce it right); "System
 * default" follows the OS and says which language that currently gives.
 * Switching is live: no restart.
 */
export function LanguageRow({
  value,
  onChange
}: {
  value: LanguageChoice
  onChange: (language: LanguageChoice) => void
}) {
  const t = useT()
  const id = useId()
  return (
    <div className="setting-row">
      <div>
        <label className="label" htmlFor={`${id}-lang`}>
          {t('settings.language.label')}
        </label>
        <div className="desc" id={`${id}-lang-desc`}>
          {t('settings.language.desc')}
        </div>
      </div>
      <select
        id={`${id}-lang`}
        className="lang-select"
        aria-describedby={`${id}-lang-desc`}
        value={value}
        onChange={(e) => {
          if (isLanguageChoice(e.target.value)) onChange(e.target.value)
        }}
      >
        <option value="system">
          {value === 'system'
            ? t('settings.language.systemCurrent', { language: LOCALE_NATIVE_NAMES[t.locale] })
            : t('settings.language.system')}
        </option>
        {SUPPORTED_LOCALES.map((locale) => (
          <option key={locale} value={locale} lang={locale} dir={textDirection(locale)}>
            {LOCALE_NATIVE_NAMES[locale]}
          </option>
        ))}
      </select>
    </div>
  )
}

export function SettingsView({ settings, onChange }: Props) {
  const t = useT()
  const [tab, setTab] = useState<SettingsTab>('general')
  const [version, setVersion] = useState('')
  const [clearLabel, setClearLabel] = useState<'clear' | 'cleared'>('clear')
  const [mcpInfo, setMcpInfo] = useState<McpInfo | null>(null)
  const [copied, setCopied] = useState(false)
  const uid = useId()

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
      // Main answers with a whole McpInfo (src/mcp/launch.ts); the preload
      // bridge still types it by its serverPath alone.
      window.tiger?.mcpInfo?.().then(setMcpInfo)
    }
  }, [tab])

  function handleClearCookies() {
    window.tiger?.clearCookies?.().then(() => {
      setClearLabel('cleared')
      announce(t('settings.cookies.announceCleared'))
      setTimeout(() => setClearLabel('clear'), 1200)
    })
  }

  const mcpSnippet = mcpInfo ? mcpClientConfig(mcpInfo, t('settings.mcp.pathPlaceholder')) : null

  function handleCopyMcp() {
    if (!mcpSnippet) return
    navigator.clipboard.writeText(mcpSnippet).then(() => {
      setCopied(true)
      announce(t('settings.mcp.snippetCopied'))
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <section className="panel settings" aria-labelledby={`${uid}-title`}>
      <div className="settings-inner">
      <h2 id={`${uid}-title`}>{t('settings.title')}</h2>
      <div className="sub">{t('settings.subtitle')}</div>

      <div className="seg settings-tabs" role="tablist" aria-label={t('settings.sectionsLabel')}>
        {TABS.map((tabDef, i) => (
          <button
            type="button"
            key={tabDef.id}
            role="tab"
            id={`${uid}-tab-${tabDef.id}`}
            aria-selected={tab === tabDef.id}
            aria-controls={`${uid}-panel`}
            tabIndex={tab === tabDef.id ? 0 : -1}
            className={tab === tabDef.id ? 'on' : ''}
            onClick={() => setTab(tabDef.id)}
            onKeyDown={(e) => {
              const next = rovingIndex(e.key, i, TABS.length)
              if (next === null) return
              e.preventDefault()
              setTab(TABS[next].id)
              ;(e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus()
            }}
          >
            {t(tabDef.labelKey)}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${tab}`}>
      {(() => {
        const current = TABS.find((def) => def.id === tab)!
        return (
          <p className="settings-intro">
            <span>{t(current.introKey)}</span>
            {current.docs && <HelpLink page={current.docs} topic={t(current.labelKey)} />}
          </p>
        )
      })()}

      {tab === 'general' && (
        <>
          <div className="setting-row">
            <div>
              <div className="label">{t('settings.appearance.label')}</div>
              <div className="desc">{t('settings.appearance.desc')}</div>
            </div>
            <div className="seg" role="group" aria-label={t('settings.appearance.label')}>
              {THEMES.map((theme) => (
                <button
                  type="button"
                  key={theme}
                  className={settings.theme === theme ? 'on' : ''}
                  aria-pressed={settings.theme === theme}
                  onClick={() => onChange({ theme })}
                >
                  {t(THEME_KEYS[theme])}
                </button>
              ))}
            </div>
          </div>

          <LanguageRow value={settings.language} onChange={(language) => onChange({ language })} />

          <div className="setting-row">
            <div>
              <div className="label">{t('settings.timeout.label')}</div>
              <div className="desc">{t('settings.timeout.desc')}</div>
            </div>
            <input
              className="num-input"
              type="number"
              min={1000}
              step={1000}
              aria-label={t('settings.timeout.aria')}
              value={settings.timeoutMs}
              onChange={(e) => onChange({ timeoutMs: Number(e.target.value) || 30000 })}
            />
          </div>

          <div className="setting-row">
            <div>
              <div className="label">{t('settings.fontSize.label')}</div>
              <div className="desc">{t('settings.fontSize.desc')}</div>
            </div>
            <input
              className="num-input"
              type="number"
              min={10}
              max={22}
              aria-label={t('settings.fontSize.label')}
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
              <div className="label">{t('settings.redirects.label')}</div>
              <div className="desc">{t('settings.redirects.desc')}</div>
            </div>
            <button
              type="button"
              className={`switch ${settings.followRedirects ? 'on' : ''}`}
              role="switch"
              aria-checked={settings.followRedirects}
              aria-label={t('settings.redirects.label')}
              onClick={() => onChange({ followRedirects: !settings.followRedirects })}
            >
              <span className="knob" />
            </button>
          </div>

          <div className="setting-row">
            <div>
              <div className="label">{t('settings.ssl.label')}</div>
              <div className="desc">{t('settings.ssl.desc')}</div>
            </div>
            <button
              type="button"
              className={`switch ${settings.sslVerify ? 'on' : ''}`}
              role="switch"
              aria-checked={settings.sslVerify}
              aria-label={t('settings.ssl.label')}
              onClick={() => onChange({ sslVerify: !settings.sslVerify })}
            >
              <span className="knob" />
            </button>
          </div>

          <div className="setting-row">
            <div>
              <div className="label">{t('settings.proxy.label')}</div>
              <div className="desc">{t('settings.proxy.desc')}</div>
            </div>
            <button
              type="button"
              className={`switch ${settings.proxyEnabled ? 'on' : ''}`}
              role="switch"
              aria-checked={settings.proxyEnabled}
              aria-label={t('settings.proxy.label')}
              onClick={() => onChange({ proxyEnabled: !settings.proxyEnabled })}
            >
              <span className="knob" />
            </button>
          </div>

          {settings.proxyEnabled && (
            <>
              <div className="setting-row">
                <div>
                  <div className="label">{t('settings.proxy.url.label')}</div>
                  <div className="desc">{t('settings.proxy.url.desc')}</div>
                </div>
                <input
                  className="num-input"
                  style={{ width: 240 }}
                  aria-label={t('settings.proxy.url.label')}
                  value={settings.proxyUrl}
                  placeholder="http://host:port"
                  onChange={(e) => onChange({ proxyUrl: e.target.value })}
                />
              </div>

              <div className="setting-row">
                <div>
                  <div className="label">{t('settings.proxy.username.label')}</div>
                  <div className="desc">
                    {t('settings.proxy.username.desc')}
                  </div>
                </div>
                <input
                  className="num-input"
                  style={{ width: 240 }}
                  aria-label={t('settings.proxy.username.label')}
                  value={settings.proxyUsername}
                  placeholder={t('settings.proxy.username.placeholder')}
                  spellCheck={false}
                  onChange={(e) => onChange({ proxyUsername: e.target.value })}
                />
              </div>

              <div className="setting-row">
                <div>
                  <div className="label">{t('settings.proxy.password.label')}</div>
                  <div className="desc">{t('settings.proxy.password.desc')}</div>
                </div>
                <input
                  ref={proxyPasswordRef}
                  className="num-input"
                  style={{ width: 240 }}
                  type="password"
                  aria-label={t('settings.proxy.password.label')}
                  value={localProxyPassword}
                  placeholder={t('settings.proxy.password.placeholder')}
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
              <div className="label">{t('settings.cookies.label')}</div>
              <div className="desc">
                {t('settings.cookies.desc')}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                className={`switch ${settings.cookieJarEnabled ? 'on' : ''}`}
                role="switch"
                aria-checked={settings.cookieJarEnabled}
                aria-label={t('settings.cookies.label')}
                onClick={() => onChange({ cookieJarEnabled: !settings.cookieJarEnabled })}
              >
                <span className="knob" />
              </button>
              <button type="button" className="cookie-clear-btn" onClick={handleClearCookies}>
                {t(clearLabel === 'clear' ? 'settings.cookies.clear' : 'settings.cookies.cleared')}
              </button>
            </div>
          </div>
        </>
      )}

      {tab === 'advanced' && (
        <>
          <div className="setting-row">
            <div>
              <div className="label">{t('settings.certExceptions.label')}</div>
              <div className="desc">
                {t('settings.certExceptions.desc')}
              </div>
            </div>
            <input
              className="num-input"
              style={{ width: 240 }}
              aria-label={t('settings.certExceptions.label')}
              value={settings.certExceptions}
              placeholder={t('settings.certExceptions.placeholder')}
              spellCheck={false}
              onChange={(e) => onChange({ certExceptions: e.target.value })}
            />
          </div>

          <div className="setting-row">
            <div>
              <div className="label">{t('settings.maxRedirects.label')}</div>
              <div className="desc">{t('settings.maxRedirects.desc')}</div>
            </div>
            <input
              className="num-input"
              type="number"
              min={0}
              max={20}
              aria-label={t('settings.maxRedirects.label')}
              value={settings.maxRedirects}
              onChange={(e) => onChange({ maxRedirects: Number(e.target.value) || 5 })}
            />
          </div>

          <div className="setting-row">
            <div>
              <div className="label">{t('settings.certSubject.label')}</div>
              <div className="desc">
                {t('settings.certSubject.desc')}
              </div>
            </div>
            <input
              className="num-input"
              style={{ width: 240 }}
              aria-label={t('settings.certSubject.label')}
              value={settings.clientCertSubject}
              placeholder={t('settings.certSubject.placeholder')}
              spellCheck={false}
              onChange={(e) => onChange({ clientCertSubject: e.target.value })}
            />
          </div>

          <h3 className="settings-group-label" data-testid="certificates-group">{t('settings.certificates.group')}</h3>

          <FileRow
            label={t('settings.files.ca.label')}
            desc={t('settings.files.ca.desc')}
            value={settings.caFile}
            filters={[{ name: t('settings.files.ca.filter'), extensions: ['pem', 'crt', 'cer'] }]}
            onChange={(v) => onChange({ caFile: v })}
          />

          <FileRow
            label={t('settings.files.clientCert.label')}
            desc={t('settings.files.clientCert.desc')}
            value={settings.clientCertFile}
            filters={[{ name: t('settings.files.ca.filter'), extensions: ['pem', 'crt', 'cer'] }]}
            onChange={(v) => onChange({ clientCertFile: v })}
          />

          <FileRow
            label={t('settings.files.clientKey.label')}
            desc={t('settings.files.clientKey.desc')}
            value={settings.clientKeyFile}
            filters={[{ name: t('settings.files.clientKey.filter'), extensions: ['pem', 'key'] }]}
            onChange={(v) => onChange({ clientKeyFile: v })}
          />

          <FileRow
            label={t('settings.files.pfx.label')}
            desc={t('settings.files.pfx.desc')}
            value={settings.clientPfxFile}
            filters={[{ name: t('settings.files.pfx.filter'), extensions: ['pfx', 'p12'] }]}
            onChange={(v) => onChange({ clientPfxFile: v })}
          />

          <div className="setting-row">
            <div style={{ flex: '0 0 200px', minWidth: 0 }}>
              <div className="label">{t('settings.passphrase.label')}</div>
              <div className="desc">{t('settings.passphrase.desc')}</div>
            </div>
            <input
              ref={passphraseRef}
              className="num-input"
              style={{ width: 240 }}
              type="password"
              aria-label={t('settings.passphrase.label')}
              value={localPassphrase}
              placeholder={t('settings.passphrase.placeholder')}
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
            {t('settings.certHint')}
          </p>
        </>
      )}

      {tab === 'mcp' && (
        <>
          <p className="mcp-intro">
            {withNode(
              t('settings.mcp.intro', { file: SLOT }),
              // i18n-ignore: file name
              <code>claude_desktop_config.json</code>
            )}
          </p>

          {mcpSnippet ? (
            <div className="mcp-code-block-wrap">
              <code className="mcp-code-block">{mcpSnippet}</code>
              <button
                type="button"
                className="mcp-copy-btn"
                onClick={handleCopyMcp}
                title={t('settings.mcp.copySnippet')}
                aria-label={copied ? t('settings.mcp.snippetCopied') : t('settings.mcp.copySnippet')}
              >
                {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
                {copied ? t('common.copied') : t('common.copy')}
              </button>
            </div>
          ) : (
            <div className="mcp-code-block-wrap">
              <code className="mcp-code-block">{t('common.loading')}</code>
            </div>
          )}

          <p className="mcp-note">
            {withNode(
              t('settings.mcp.note', { placeholder: SLOT }),
              <code>{t('settings.mcp.pathPlaceholder')}</code>
            )}
          </p>
          {mcpInfo?.note === 'store' && <p className="mcp-note">{t('settings.mcp.storeNote')}</p>}
          {mcpInfo?.note === 'node' && <p className="mcp-note">{t('settings.mcp.nodeNote')}</p>}
        </>
      )}

      {tab === 'privacy' && (
        <div className="setting-row">
          <div>
            <div className="label">{t('settings.analytics.label')}</div>
            <div className="desc" id={`${uid}-analytics-desc`}>
              {t('settings.analytics.desc')}
            </div>
          </div>
          <button
            type="button"
            className={`switch ${settings.analyticsEnabled ? 'on' : ''}`}
            role="switch"
            aria-checked={settings.analyticsEnabled}
            aria-label={t('settings.analytics.aria')}
            aria-describedby={`${uid}-analytics-desc`}
            onClick={() => onChange({ analyticsEnabled: !settings.analyticsEnabled })}
          >
            <span className="knob" />
          </button>
        </div>
      )}

      {tab === 'about' && (
        <div className="setting-row">
          <div>
            <div className="label">{t('settings.autoUpdate.label')}</div>
            <div className="desc" id={`${uid}-updates-desc`}>
              {t('settings.autoUpdate.desc')}
            </div>
          </div>
          <button
            type="button"
            className={`switch ${settings.autoInstallUpdates !== false ? 'on' : ''}`}
            role="switch"
            aria-checked={settings.autoInstallUpdates !== false}
            aria-label={t('settings.autoUpdate.label')}
            aria-describedby={`${uid}-updates-desc`}
            onClick={() => onChange({ autoInstallUpdates: settings.autoInstallUpdates === false })}
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
          <span aria-hidden>
            <Logo size={34} rounded />
          </span>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text)' }}>Tiger</div>
            <div style={{ fontSize: 12 }}>{t('settings.about.tagline')}</div>
            {version && (
              <div style={{ fontSize: 12 }}>{t('settings.about.version', { version })}</div>
            )}
          </div>
        </div>
      )}
      </div>
      </div>
    </section>
  )
}
