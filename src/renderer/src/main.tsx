import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { observeFirstPaint, rendererPerfMark } from './perf'
import { followMainLocale, initialLocale, setLocale } from './i18n'
import './styles.css'

// ES imports are hoisted: this runs once the entry chunk has fully evaluated.
rendererPerfMark('entry-evaluated')
observeFirstPaint()

function render(): void {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

// Load the UI language before the first frame (English needs no fetch; any
// other catalog is a small local chunk), so the app never flashes English.
followMainLocale()
setLocale(initialLocale()).then(render, render)
