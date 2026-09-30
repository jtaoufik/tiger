import '@testing-library/jest-dom/vitest'
import { setLocale } from '../src/renderer/src/i18n'

// The renderer loads its catalogs on demand (English too); load English once
// so every suite renders real text, as the app does before its first paint.
await setLocale('en')

// A few suites opt into the node environment (// @vitest-environment node);
// everything below is for the DOM ones.
if (typeof window !== 'undefined') {
  // vitest's jsdom exposes a localStorage object without working methods
  // (about:blank origin). Session persistence tests need a real store, so back
  // it with an in-memory Map for the whole suite.
  const store = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => void store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size
      }
    }
  })

  // Rarely used surfaces are code-split (src/renderer/src/surfaces.ts) and load
  // on first render in the app. Tests exercise the surfaces themselves, so load
  // every chunk up front: a lazy surface whose chunk is loaded renders
  // synchronously, exactly as in the app once its idle warm-up has run.
  // test/renderer/lazy.test.tsx covers the loading path itself.
  const { preloadAllSurfaces } = await import('../src/renderer/src/lazy')
  await import('../src/renderer/src/surfaces')
  await preloadAllSurfaces()
}
