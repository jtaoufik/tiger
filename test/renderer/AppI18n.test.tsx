import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import App from '../../src/renderer/src/App'
import { setLocale } from '../../src/renderer/src/i18n'

vi.mock('../../src/renderer/src/analytics', () => ({
  initAnalytics: vi.fn().mockResolvedValue(undefined),
  setAnalyticsEnabled: vi.fn(),
  trackEvent: vi.fn()
}))

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

beforeEach(() => {
  document.body.innerHTML = ''
  window.localStorage.clear()
  delete (window as { tiger?: unknown }).tiger
})

afterEach(async () => {
  await act(() => setLocale('en'))
})

describe('App shell in French', () => {
  it('translates the skip link, environment picker and top bar', async () => {
    render(<App />)
    await act(() => setLocale('fr'))
    expect(screen.getByRole('link', { name: "Aller à l'URL de la requête" })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Environnement actif' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Aucun environnement' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Historique' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Paramètres' })).toBeInTheDocument()
  })

  it('switches back to English live', async () => {
    render(<App />)
    await act(() => setLocale('fr'))
    await act(() => setLocale('en'))
    expect(screen.getByRole('link', { name: 'Skip to request URL' })).toBeInTheDocument()
  })
})
