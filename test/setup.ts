import '@testing-library/jest-dom/vitest'

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
import { preloadAllSurfaces } from '../src/renderer/src/lazy'
import '../src/renderer/src/surfaces'
await preloadAllSurfaces()
