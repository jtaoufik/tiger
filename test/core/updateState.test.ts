import { englishT } from '../../src/core/i18n/english'
import { describe, expect, it } from 'vitest'
import {
  friendlyUpdateError,
  INITIAL_UPDATE_STATE,
  reduceUpdate,
  releaseNotesUrl,
  updateBanner,
  updateStatusText,
  type UpdateEvent,
  type UpdateState
} from '../../src/core/updateState'

const run = (events: UpdateEvent[], from: UpdateState = INITIAL_UPDATE_STATE) =>
  events.reduce(reduceUpdate, from)

describe('reduceUpdate', () => {
  it('auto-download path: checking -> downloading -> progress -> downloaded', () => {
    let s = run([{ type: 'checking' }])
    expect(s).toEqual({ status: 'checking' })
    s = reduceUpdate(s, { type: 'available', version: '0.7.1', autoDownload: true })
    expect(s).toEqual({ status: 'downloading', version: '0.7.1', percent: 0 })
    s = reduceUpdate(s, { type: 'progress', percent: 42.7 })
    expect(s).toEqual({ status: 'downloading', version: '0.7.1', percent: 42 })
    s = reduceUpdate(s, { type: 'downloaded', version: '0.7.1' })
    expect(s).toEqual({ status: 'downloaded', version: '0.7.1' })
  })

  it('manual-download path: available waits, download-started begins the download', () => {
    let s = run([{ type: 'checking' }, { type: 'available', version: '0.7.1', autoDownload: false }])
    expect(s).toEqual({ status: 'available', version: '0.7.1' })
    s = reduceUpdate(s, { type: 'download-started' })
    expect(s).toEqual({ status: 'downloading', version: '0.7.1', percent: 0 })
  })

  it('not-available -> up-to-date', () => {
    expect(run([{ type: 'checking' }, { type: 'not-available' }])).toEqual({ status: 'up-to-date' })
  })

  it('clamps progress to 0..100 and ignores progress without a known version', () => {
    const d: UpdateState = { status: 'downloading', version: '1.0.0', percent: 10 }
    expect(reduceUpdate(d, { type: 'progress', percent: 250 })).toMatchObject({ percent: 100 })
    expect(reduceUpdate(d, { type: 'progress', percent: -5 })).toMatchObject({ percent: 0 })
    expect(reduceUpdate(d, { type: 'progress', percent: NaN })).toMatchObject({ percent: 0 })
    expect(reduceUpdate(INITIAL_UPDATE_STATE, { type: 'progress', percent: 50 })).toBe(
      INITIAL_UPDATE_STATE
    )
  })

  it('a periodic re-check never hides a download in flight or a ready update', () => {
    const d: UpdateState = { status: 'downloading', version: '1.0.0', percent: 30 }
    expect(reduceUpdate(d, { type: 'checking' })).toBe(d)
    expect(reduceUpdate(d, { type: 'not-available' })).toBe(d)
    expect(reduceUpdate(d, { type: 'available', version: '1.0.0', autoDownload: true })).toBe(d)
    const r: UpdateState = { status: 'downloaded', version: '1.0.0' }
    expect(reduceUpdate(r, { type: 'checking' })).toBe(r)
    expect(reduceUpdate(r, { type: 'not-available' })).toBe(r)
    expect(reduceUpdate(r, { type: 'available', version: '1.0.0', autoDownload: true })).toBe(r)
    expect(reduceUpdate(r, { type: 'error', message: 'offline' })).toBe(r)
    expect(reduceUpdate(r, { type: 'progress', percent: 5 })).toBe(r)
    expect(reduceUpdate(r, { type: 'download-started' })).toBe(r)
  })

  it('a newer release while one is ready starts over with the newer one', () => {
    const r: UpdateState = { status: 'downloaded', version: '1.0.0' }
    expect(reduceUpdate(r, { type: 'available', version: '1.0.1', autoDownload: true })).toEqual({
      status: 'downloading',
      version: '1.0.1',
      percent: 0
    })
  })

  it('errors keep the version they happened on', () => {
    const d: UpdateState = { status: 'downloading', version: '1.0.0', percent: 30 }
    expect(reduceUpdate(d, { type: 'error', message: 'x' })).toEqual({
      status: 'error',
      message: 'x',
      version: '1.0.0'
    })
    expect(reduceUpdate({ status: 'checking' }, { type: 'error', message: 'x' })).toEqual({
      status: 'error',
      message: 'x'
    })
  })

  it('download-started needs a known version', () => {
    expect(reduceUpdate({ status: 'checking' }, { type: 'download-started' })).toEqual({
      status: 'checking'
    })
  })
})

describe('updateBanner / updateStatusText', () => {
  it('maps states to the non-modal banner (errors and checks stay silent)', () => {
    expect(updateBanner({ status: 'idle' })).toBeNull()
    expect(updateBanner({ status: 'checking' })).toBeNull()
    expect(updateBanner({ status: 'up-to-date' })).toBeNull()
    expect(updateBanner({ status: 'error', message: 'x' })).toBeNull()
    expect(updateBanner({ status: 'available', version: '1' })).toBe('available')
    expect(updateBanner({ status: 'downloading', version: '1', percent: 3 })).toBe('progress')
    expect(updateBanner({ status: 'downloaded', version: '1' })).toBe('ready')
  })

  it('writes the owner-facing copy', () => {
    expect(updateStatusText({ status: 'downloading', version: '0.7.1', percent: 42 }, englishT)).toBe(
      'Downloading update 0.7.1… 42%'
    )
    expect(updateStatusText({ status: 'downloaded', version: '0.7.1' }, englishT)).toBe(
      'Tiger 0.7.1 is ready. Restart to update.'
    )
    expect(updateStatusText({ status: 'available', version: '0.7.1' }, englishT)).toBe(
      'Tiger 0.7.1 is available.'
    )
    expect(updateStatusText({ status: 'up-to-date' }, englishT)).toBe("You're on the latest version.")
    expect(updateStatusText({ status: 'idle' }, englishT)).toBe('')
  })
})

describe('friendlyUpdateError', () => {
  it('offline', () => {
    expect(friendlyUpdateError(new Error('net::ERR_INTERNET_DISCONNECTED'), englishT)).toMatch(
      /Couldn't reach/
    )
    expect(friendlyUpdateError(new Error('getaddrinfo ENOTFOUND github.com'), englishT)).toMatch(
      /Couldn't reach/
    )
  })

  it('no metadata on the release', () => {
    const e = Object.assign(
      new Error('Cannot find latest-mac.yml in the latest release artifacts\n<xml>'),
      { code: 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND' }
    )
    expect(friendlyUpdateError(e, englishT)).toBe('No update is published for this platform yet.')
  })

  it('signature / checksum', () => {
    const sig = Object.assign(new Error('x'), { code: 'ERR_UPDATER_INVALID_SIGNATURE' })
    expect(friendlyUpdateError(sig, englishT)).toMatch(/failed verification/)
    expect(friendlyUpdateError(new Error('sha512 checksum mismatch, expected a, got b'), englishT)).toMatch(
      /failed verification/
    )
  })

  it('anything else: first line only, capped', () => {
    const msg = friendlyUpdateError(new Error(`${'a'.repeat(300)}\n    at stack`), englishT)
    expect(msg.startsWith('Update failed: ')).toBe(true)
    expect(msg).not.toContain('stack')
    expect(msg.length).toBeLessThan(170)
    expect(friendlyUpdateError(undefined, englishT)).toBe('Update failed.')
  })
})

it('releaseNotesUrl points at the tagged GitHub release', () => {
  expect(releaseNotesUrl('0.7.1')).toBe('https://github.com/jtaoufik/tiger/releases/tag/v0.7.1')
  expect(releaseNotesUrl('v0.7.1')).toBe('https://github.com/jtaoufik/tiger/releases/tag/v0.7.1')
})
