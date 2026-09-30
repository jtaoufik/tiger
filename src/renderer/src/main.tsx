import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { observeFirstPaint, rendererPerfMark } from './perf'
import './styles.css'

// ES imports are hoisted: this runs once the entry chunk has fully evaluated.
rendererPerfMark('entry-evaluated')
observeFirstPaint()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
