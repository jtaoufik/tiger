import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './ErrorBoundary'
import { observeFirstPaint, rendererPerfMark } from './perf'
import { followMainLocale, initialLocale, setLocale } from './i18n'
import './styles.css'

// ES imports are hoisted: this runs once the entry chunk has fully evaluated.
rendererPerfMark('entry-evaluated')
observeFirstPaint()

// Errors that escape React (event handlers, timers, un-awaited promises) do not
// reach the boundary; log them so a silent failure leaves a trace in DevTools.
window.addEventListener('error', (e) => {
  console.error('Tiger: uncaught error', e.error ?? e.message)
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('Tiger: unhandled rejection', e.reason)
})

function render(): void {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  )
}

// Load the UI language before the first frame (English needs no fetch; any
// other catalog is a small local chunk), so the app never flashes English.
// A catalog chunk that fails to load falls back to English rather than
// rendering every string as its key.
followMainLocale()
setLocale(initialLocale())
  .catch(() => setLocale('en'))
  .then(render, render)
