/**
 * In-app update state machine. The main process feeds electron-updater events
 * through reduceUpdate() and broadcasts the resulting state; the renderer only
 * renders it. Pure, so every transition is unit-tested.
 */

import { REPO_URL } from './actions'
import { compareVersions } from './version'

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'up-to-date' }
  /** A newer version exists but is not downloading (automatic install is off). */
  | { status: 'available'; version: string }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string; version?: string }

export type UpdateEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string; autoDownload: boolean }
  | { type: 'not-available' }
  | { type: 'download-started' }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string }

export const INITIAL_UPDATE_STATE: UpdateState = { status: 'idle' }

function versionOf(state: UpdateState): string | undefined {
  return 'version' in state ? state.version : undefined
}

export function reduceUpdate(state: UpdateState, event: UpdateEvent): UpdateState {
  switch (event.type) {
    case 'checking':
      // A periodic re-check must not hide a download in flight or a ready update.
      if (state.status === 'downloading' || state.status === 'downloaded') return state
      return { status: 'checking' }

    case 'available': {
      if (state.status === 'downloaded' && compareVersions(event.version, state.version) <= 0) {
        return state
      }
      if (state.status === 'downloading' && state.version === event.version) return state
      return event.autoDownload
        ? { status: 'downloading', version: event.version, percent: 0 }
        : { status: 'available', version: event.version }
    }

    case 'not-available':
      if (state.status === 'downloading' || state.status === 'downloaded') return state
      return { status: 'up-to-date' }

    case 'download-started': {
      const version = versionOf(state)
      if (state.status === 'downloaded' || !version) return state
      return { status: 'downloading', version, percent: 0 }
    }

    case 'progress': {
      const version = versionOf(state)
      if (state.status === 'downloaded' || !version) return state
      const percent = Math.max(0, Math.min(100, Math.floor(event.percent || 0)))
      return { status: 'downloading', version, percent }
    }

    case 'downloaded':
      return { status: 'downloaded', version: event.version }

    case 'error': {
      // A failed background re-check never takes away an update that is ready.
      if (state.status === 'downloaded') return state
      const version = versionOf(state)
      return version
        ? { status: 'error', message: event.message, version }
        : { status: 'error', message: event.message }
    }
  }
}

/** The non-modal banner to show for a state, or null for none. Errors stay out of the way. */
export type UpdateBanner = 'progress' | 'available' | 'ready' | null

export function updateBanner(state: UpdateState): UpdateBanner {
  switch (state.status) {
    case 'downloading':
      return 'progress'
    case 'available':
      return 'available'
    case 'downloaded':
      return 'ready'
    default:
      return null
  }
}

/** One-line status for banners, the modal and screen-reader announcements. */
export function updateStatusText(state: UpdateState): string {
  switch (state.status) {
    case 'idle':
      return ''
    case 'checking':
      return 'Checking for updates…'
    case 'up-to-date':
      return "You're on the latest version."
    case 'available':
      return `Tiger ${state.version} is available.`
    case 'downloading':
      return `Downloading update ${state.version}… ${state.percent}%`
    case 'downloaded':
      return `Tiger ${state.version} is ready. Restart to update.`
    case 'error':
      return state.message
  }
}

/**
 * Turn an electron-updater error into one short sentence. Its raw messages
 * can carry stack traces and whole XML feeds, which never belong in the UI.
 */
export function friendlyUpdateError(err: unknown): string {
  const e = (err ?? {}) as { code?: unknown; message?: unknown }
  const code = typeof e.code === 'string' ? e.code : ''
  const message = typeof e.message === 'string' ? e.message : String(err ?? '')
  if (
    /net::|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ERR_INTERNET_DISCONNECTED/i.test(
      message
    )
  ) {
    return "Couldn't reach the update server. Check your connection and try again."
  }
  if (
    code === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND' ||
    code === 'ERR_UPDATER_LATEST_VERSION_NOT_FOUND' ||
    code === 'ERR_UPDATER_ZIP_FILE_NOT_FOUND'
  ) {
    return 'No update is published for this platform yet.'
  }
  if (code === 'ERR_UPDATER_INVALID_SIGNATURE' || /sha512 checksum mismatch/i.test(message)) {
    return 'The downloaded update failed verification and was not installed.'
  }
  const first = message.split('\n')[0].trim()
  const short = first.length > 140 ? `${first.slice(0, 139)}…` : first
  return short ? `Update failed: ${short}` : 'Update failed.'
}

/** GitHub release page for a version (release notes + manual downloads). */
export function releaseNotesUrl(version: string): string {
  return `${REPO_URL}/releases/tag/v${version.replace(/^v/, '')}`
}
