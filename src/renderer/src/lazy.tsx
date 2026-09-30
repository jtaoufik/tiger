/**
 * Rarely used surfaces live in their own chunks so the startup bundle only
 * carries what the first screen needs. Each one is loaded the first time it
 * renders, and all of them are warmed once the app is idle after startup, so
 * opening one later is instant.
 *
 * Deliberately not React.lazy + Suspense: a suspended tree is revealed on
 * React's fallback throttle (~300 ms) even when the chunk arrives from disk in
 * a few milliseconds. Here a surface whose chunk is loaded renders
 * synchronously, and one that is not shows an accessible status line and
 * swaps in the moment the chunk resolves.
 */
import { useEffect, useState, type ComponentType, type JSX } from 'react'
import type { MessageKey } from '@core/i18n'
import { useT } from './i18n'
import './lazy.css'

type Loader<P> = () => Promise<ComponentType<P>>

export interface LazySurface<P> {
  (props: P): JSX.Element
  /** Start (or join) loading the chunk. */
  preload: () => Promise<ComponentType<P>>
}

const registry: Array<() => Promise<unknown>> = []

/**
 * @param label what is loading, for the status message ("Loading settings…"): a
 *   `sidebar.lazy.*` message key (translated), or plain text.
 * @param overlay true for dialogs: the placeholder floats instead of taking space.
 */
export function lazySurface<P extends object>(
  load: Loader<P>,
  label: string,
  overlay = false
): LazySurface<P> {
  let loaded: ComponentType<P> | null = null
  let pending: Promise<ComponentType<P>> | null = null
  const preload = (): Promise<ComponentType<P>> =>
    (pending ??= load().then(
      (c) => (loaded = c),
      (e) => {
        pending = null // a later open retries (e.g. after a transient read error)
        throw e
      }
    ))

  function Surface(props: P) {
    // Functional initializers: the state holds a component, not a call to one.
    const [C, setC] = useState<ComponentType<P> | null>(() => loaded)
    const [failed, setFailed] = useState(false)
    useEffect(() => {
      if (C) return
      let live = true
      preload().then(
        (c) => live && setC(() => c),
        () => live && setFailed(true)
      )
      return () => {
        live = false
      }
    }, [C])
    if (C) return <C {...props} />
    return <LoadingSurface label={label} overlay={overlay} failed={failed} />
  }

  const surface = Surface as LazySurface<P>
  surface.preload = preload
  registry.push(preload)
  return surface
}

/** Accessible placeholder while a chunk loads (normally a few milliseconds). */
export function LoadingSurface({
  label,
  overlay,
  failed
}: {
  label: string
  overlay?: boolean
  failed?: boolean
}) {
  const t = useT()
  const name = label.startsWith('sidebar.lazy.') ? t(label as MessageKey) : label
  return (
    <div
      className={`lazy-loading${overlay ? ' overlay' : ''}`}
      role={failed ? 'alert' : 'status'}
      aria-live={failed ? undefined : 'polite'}
    >
      {failed ? t('sidebar.lazy.failed', { label: name }) : t('sidebar.lazy.loading', { label: name })}
    </div>
  )
}

/** Load every lazy surface now (idle warm-up after startup, and tests). */
export function preloadAllSurfaces(): Promise<void> {
  return Promise.all(registry.map((p) => p())).then(() => undefined)
}

/** Warm the chunks once the first screen is up and the main thread is idle. */
export function preloadSurfacesWhenIdle(): void {
  const run = () => void preloadAllSurfaces().catch(() => {})
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2000 })
  else setTimeout(run, 500)
}
