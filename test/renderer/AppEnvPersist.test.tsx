import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../src/renderer/src/App'
import { serializeEnvironment } from '../../src/core/environment'
import { bridge, envPicker, installMatchMedia, lastSentUrl, pickedEnv, sidebar } from './appHarness'

vi.mock('../../src/renderer/src/analytics', () => ({
  initAnalytics: vi.fn().mockResolvedValue(undefined),
  setAnalyticsEnabled: vi.fn(),
  trackEvent: vi.fn()
}))
beforeAll(installMatchMedia)
afterEach(() => {
  delete (window as { tiger?: unknown }).tiger
  localStorage.clear()
})

const SEP = '\u001f'
const ROOT = '/col'
const reqId = `${ROOT}${SEP}${ROOT}/me.tiger`

/** A disk collection with dev and staging, restored from the last session. */
function diskBridge(post = '') {
  const files = new Map<string, string>([
    [
      '/col/me.tiger',
      `meta {\n  name: Me\n}\n\nget {\n  url: {{host}}/me?t={{token}}\n}\n${post ? `\nscript:post {\n  ${post}\n}\n` : ''}`
    ],
    ['/col/environments/dev.tiger', serializeEnvironment({ name: 'dev', variables: [{ name: 'host', value: 'https://dev.test', enabled: true }, { name: 'token', value: 't-1', enabled: true }] })],
    ['/col/environments/staging.tiger', serializeEnvironment({ name: 'staging', variables: [{ name: 'host', value: 'https://staging.test', enabled: true }, { name: 'token', value: 't-2', enabled: true }] })]
  ])
  return Object.assign(bridge([]), {
    files,
    openPath: vi.fn(async () => ({
      root: ROOT,
      name: 'col',
      requests: [{ name: 'Me', method: 'get', path: '/col/me.tiger', folder: [] }],
      environments: [
        { name: 'dev', path: '/col/environments/dev.tiger' },
        { name: 'staging', path: '/col/environments/staging.tiger' }
      ],
      settings: {},
      folders: []
    })),
    readFile: vi.fn(async (p: string) => files.get(p) ?? ''),
    writeFile: vi.fn(async (p: string, c: string) => {
      files.set(p, c)
      return true
    })
  })
}

function restoreSession() {
  localStorage.setItem('tiger.session.roots', JSON.stringify([ROOT]))
  localStorage.setItem('tiger.session.tabs', JSON.stringify([{ kind: 'request', id: reqId }]))
  localStorage.setItem('tiger.session.active', `r:${reqId}`)
}

describe('environments across a restart', () => {
  it('keeps the environment picked in a collection', async () => {
    restoreSession()
    ;(window as { tiger?: unknown }).tiger = diskBridge()
    render(<App />)
    await waitFor(() => expect(pickedEnv()).toBe('dev'))
    fireEvent.change(envPicker(), { target: { value: `${ROOT}${SEP}staging` } })
    expect(pickedEnv()).toBe('staging')
    cleanup()

    const b = diskBridge()
    ;(window as { tiger?: unknown }).tiger = b
    render(<App />)
    await waitFor(() => expect(pickedEnv()).toBe('staging'))
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }))
    await waitFor(() => expect(b.send).toHaveBeenCalled())
    expect(lastSentUrl(b)).toBe('https://staging.test/me?t=t-2')
  })

  it('saves pm.environment.unset, so the variable is gone for the next send', async () => {
    restoreSession()
    const { runScript } = await import('../../src/core/script')
    const b = Object.assign(diskBridge("pm.environment.unset('token')"), {
      runScript: vi.fn(async (job: { source: string }) => runScript(job.source, job as never))
    })
    ;(window as { tiger?: unknown }).tiger = b
    render(<App />)
    await waitFor(() => expect(pickedEnv()).toBe('dev'))
    await within(sidebar()).findByText('Me')
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }))
    await waitFor(() => expect(b.files.get('/col/environments/dev.tiger')).not.toContain('token'))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(b.send).toHaveBeenCalledTimes(2))
    expect(lastSentUrl(b)).toBe('https://dev.test/me?t={{token}}')
  })
})
