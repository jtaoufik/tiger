import { useCallback, useEffect, useRef, useState } from 'react'
import type { UpdateMode } from '@core/updateMode'
import {
  INITIAL_UPDATE_STATE,
  updateBanner,
  updateStatusText,
  type UpdateState
} from '@core/updateState'
import { announce } from './a11y'
import { currentTranslator } from './i18n'

/** Identity of what a banner shows, so "Later" hides only that one. */
function bannerKey(state: UpdateState): string | null {
  const kind = updateBanner(state)
  return kind && 'version' in state ? `${kind}:${state.version}` : null
}

/**
 * Mirrors the main process update state (electron-updater installs only) and
 * announces each step to screen readers once. `mode` is null until the main
 * process has answered; the website-link flow applies when it is 'manual'.
 */
export function useUpdater() {
  const [mode, setMode] = useState<UpdateMode | null>(null)
  const [state, setState] = useState<UpdateState>(INITIAL_UPDATE_STATE)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const userInitiated = useRef(false)
  const lastStatus = useRef<string>(INITIAL_UPDATE_STATE.status)

  useEffect(() => {
    const api = window.tiger
    if (!api?.updateMode) {
      setMode('manual')
      return
    }
    let off: (() => void) | undefined
    let cancelled = false
    api
      .updateMode()
      .then((info) => {
        if (cancelled) return
        setMode(info.mode)
        if (info.mode !== 'auto') return
        off = api.onUpdateState?.(setState)
        api.updateState?.().then((s) => !cancelled && setState(s))
      })
      .catch(() => !cancelled && setMode('manual'))
    return () => {
      cancelled = true
      off?.()
    }
  }, [])

  // Announce status changes (never each progress tick). Checking, up-to-date
  // and errors are only spoken when the user asked for the check.
  useEffect(() => {
    if (state.status === lastStatus.current) return
    lastStatus.current = state.status
    const text = updateStatusText(state, currentTranslator())
    if (!text) return
    switch (state.status) {
      case 'downloading':
        announce(currentTranslator()('settings.update.announceDownloading', { version: state.version }))
        break
      case 'available':
      case 'downloaded':
        announce(text)
        break
      case 'error':
        if (userInitiated.current) announce(text, { assertive: true })
        userInitiated.current = false
        break
      case 'up-to-date':
        if (userInitiated.current) announce(text)
        userInitiated.current = false
        break
      case 'checking':
        if (userInitiated.current) announce(text)
        break
    }
  }, [state])

  const check = useCallback(() => {
    userInitiated.current = true
    setDismissed(null)
    return window.tiger?.checkForUpdatesNow?.().then(setState)
  }, [])

  const download = useCallback(() => {
    void window.tiger?.downloadUpdate?.()
  }, [])

  const restart = useCallback(() => {
    void window.tiger?.installUpdate?.()
  }, [])

  const key = bannerKey(state)
  const dismiss = useCallback(() => setDismissed(key), [key])

  return {
    mode,
    state,
    /** Banner to show now, or null (none, or hidden with Later). */
    banner: key && key !== dismissed ? updateBanner(state) : null,
    check,
    download,
    restart,
    dismiss
  }
}
