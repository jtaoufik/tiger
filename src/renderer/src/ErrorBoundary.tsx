/**
 * Last line of defence for the app window: an exception thrown while React
 * renders would otherwise unmount the whole tree and leave a blank window.
 * Shows a plain panel with the message and a Reload button instead. Kept free
 * of app imports (only React and the translator) so it cannot itself fail
 * because of the code it guards.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { t } from './i18n'
import './ErrorBoundary.css'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Tiger: unrecoverable render error', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="crash" role="alert">
        <div className="crash-panel">
          <h1>{t('app.crash.title')}</h1>
          <p>{t('app.crash.detail')}</p>
          <pre>{error.message}</pre>
          <button type="button" className="btn accent" onClick={() => window.location.reload()}>
            {t('app.crash.reload')}
          </button>
        </div>
      </div>
    )
  }
}
