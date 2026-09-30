import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { SettingsView } from '../../src/renderer/src/components/SettingsView'
import { UpdateBanner } from '../../src/renderer/src/components/UpdateBanner'
import { setLocale } from '../../src/renderer/src/i18n'
import type { Settings } from '../../src/main/settings'

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false
  })) as unknown as typeof window.matchMedia
})

afterEach(async () => {
  await act(() => setLocale('en'))
})

const base: Settings = {
  theme: 'system',
  language: 'en',
  timeoutMs: 30000,
  fontSize: 13,
  followRedirects: true,
  maxRedirects: 5,
  sslVerify: true,
  certExceptions: '',
  caFile: '',
  clientCertFile: '',
  clientKeyFile: '',
  clientPfxFile: '',
  certPassphrase: '',
  cookieJarEnabled: true,
  proxyEnabled: false,
  proxyUrl: '',
  proxyUsername: '',
  proxyPassword: '',
  clientCertSubject: '',
  autoInstallUpdates: true,
  analyticsEnabled: true,
  clientId: 'test-client-id'
}

describe('Settings language', () => {
  it('lists System default and every language in its own name', () => {
    render(<SettingsView settings={base} onChange={vi.fn()} />)
    const select = screen.getByLabelText('Language') as HTMLSelectElement
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent)
    ).toEqual(['System default', 'English', '中文', 'हिन्दी', 'Español', 'Français', 'العربية'])
  })

  it('Settings language switch re-renders live', async () => {
    const onChange = vi.fn()
    render(<SettingsView settings={base} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'fr' } })
    expect(onChange).toHaveBeenCalledWith({ language: 'fr' })
    await act(() => setLocale('fr'))
    // No remount and no prop change: the hook alone re-renders the page.
    expect(screen.getByRole('tab', { name: 'Général' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Réseau' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'À propos' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Apparence' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sombre' })).toBeInTheDocument()
  })

  it('translates the update banner', async () => {
    await act(() => setLocale('fr'))
    render(
      <UpdateBanner
        kind="ready"
        state={{ status: 'downloaded', version: '0.8.0' }}
        onRestart={vi.fn()}
        onDownload={vi.fn()}
        onLater={vi.fn()}
        onOpenExternal={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Redémarrer maintenant' })).toBeInTheDocument()
    expect(
      screen.getByText('Tiger 0.8.0 est prêt. Redémarrez pour mettre à jour.')
    ).toBeInTheDocument()
  })
})
