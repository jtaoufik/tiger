/**
 * Captures and script variables go to the environment the request went out
 * with, even when another collection is active by the time it answers.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../src/renderer/src/App'
import type { ImportResult } from '../../src/core/import/types'
import { bridge, importVia, installMatchMedia, pickedEnv, sidebar } from './appHarness'
import { executeJob } from '../../src/core/scriptProtocol'

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

describe('captures land in the environment the request was SENT with', () => {
  const alpha: ImportResult = {
    name: 'Alpha',
    source: 'postman',
    requests: [
      {
        path: [],
        request: {
          name: 'Login',
          method: 'post',
          url: '{{host}}/login',
          headers: [],
          query: [],
          body: { type: 'none', content: '' },
          captures: [{ name: 'token', value: 'body.token', enabled: true }]
        }
      },
      {
        path: [],
        request: {
          name: 'Profile',
          method: 'get',
          url: '{{host}}/profile?t={{token}}',
          headers: [],
          query: [],
          body: { type: 'none', content: '' }
        }
      }
    ],
    environments: [{ name: 'Alpha env', variables: [{ name: 'host', value: 'https://alpha.test', enabled: true }] }]
  }
  const beta: ImportResult = {
    name: 'Beta',
    source: 'postman',
    requests: [
      {
        path: [],
        request: {
          name: 'Me',
          method: 'get',
          url: '{{host}}/me?t={{token}}',
          headers: [],
          query: [],
          body: { type: 'none', content: '' }
        }
      }
    ],
    environments: [{ name: 'Beta env', variables: [{ name: 'host', value: 'https://beta.test', enabled: true }] }]
  }

  it('switching to another collection while Login is in flight does not move the token there', async () => {
    const b = bridge([alpha, beta])
    let release: (v: unknown) => void = () => {}
    b.send.mockImplementation(async (built: { url: string }) => {
      if (built.url.endsWith('/login')) {
        await new Promise((r) => (release = r))
        return { status: 200, statusText: 'OK', headers: {}, body: '{"token":"ALPHA-TOKEN"}', timeMs: 1 }
      }
      return { status: 200, statusText: 'OK', headers: {}, body: '{}', timeMs: 1 }
    })
    ;(window as { tiger?: unknown }).tiger = b
    render(<App />)
    await importVia('Postman')
    await importVia('Postman')

    fireEvent.click(within(sidebar()).getByText('Login'))
    await waitFor(() => expect(pickedEnv()).toBe('Alpha env'))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(b.send).toHaveBeenCalledTimes(1))

    // While Login is in flight, look at a request of the other collection.
    fireEvent.click(within(sidebar()).getByText('Me'))
    await waitFor(() => expect(pickedEnv()).toBe('Beta env'))
    await act(async () => release(undefined))
    await screen.findByText(/Captured/i)

    // Beta's environment must not have received Alpha's token...
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(b.send).toHaveBeenCalledTimes(2))
    const betaUrl = (b.send.mock.calls[1][0] as { url: string }).url

    // ...and Alpha's environment must have it.
    fireEvent.click(within(sidebar()).getByText('Profile'))
    await waitFor(() => expect(pickedEnv()).toBe('Alpha env'))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(b.send).toHaveBeenCalledTimes(3))
    const alphaUrl = (b.send.mock.calls[2][0] as { url: string }).url

    expect({ betaUrl, alphaUrl }).toEqual({
      betaUrl: 'https://beta.test/me?t={{token}}',
      alphaUrl: 'https://alpha.test/profile?t=ALPHA-TOKEN'
    })
  })
})

describe('post-response pm.environment.set lands in the environment the request was SENT with', () => {
  it('switching collection mid-flight does not write the script variable into the other collection', async () => {
    const mk = (name: string, reqs: ImportResult['requests'], host: string): ImportResult => ({
      name,
      source: 'postman',
      requests: reqs,
      environments: [{ name: `${name} env`, variables: [{ name: 'host', value: host, enabled: true }] }]
    })
    const alpha = mk(
      'Alpha',
      [
        {
          path: [],
          request: {
            name: 'Login',
            method: 'post',
            url: '{{host}}/login',
            headers: [],
            query: [],
            body: { type: 'none', content: '' },
            postScript: 'pm.environment.set("token", pm.response.json().token)'
          }
        }
      ],
      'https://alpha.test'
    )
    const beta = mk(
      'Beta',
      [{ path: [], request: { name: 'Me', method: 'get', url: '{{host}}/me?t={{token}}', headers: [], query: [], body: { type: 'none', content: '' } } }],
      'https://beta.test'
    )
    const b = bridge([alpha, beta]) as ReturnType<typeof bridge> & { runScript?: (job: unknown) => Promise<unknown> }
    // The real host-side evaluator, minus the Electron window around it.
    b.runScript = async (job: unknown) => executeJob(job)
    let release: (v: unknown) => void = () => {}
    b.send.mockImplementation(async (built: { url: string }) => {
      if (built.url.endsWith('/login')) {
        await new Promise((r) => (release = r))
        return { status: 200, statusText: 'OK', headers: {}, body: '{"token":"ALPHA-TOKEN"}', timeMs: 1 }
      }
      return { status: 200, statusText: 'OK', headers: {}, body: '{}', timeMs: 1 }
    })
    ;(window as { tiger?: unknown }).tiger = b
    render(<App />)
    await importVia('Postman')
    await importVia('Postman')
    fireEvent.click(within(sidebar()).getByText('Login'))
    await waitFor(() => expect(pickedEnv()).toBe('Alpha env'))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(b.send).toHaveBeenCalledTimes(1))
    fireEvent.click(within(sidebar()).getByText('Me'))
    await waitFor(() => expect(pickedEnv()).toBe('Beta env'))
    await act(async () => release(undefined))
    await screen.findByText(/Captured/i)
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(b.send).toHaveBeenCalledTimes(2))
    expect((b.send.mock.calls[1][0] as { url: string }).url).toBe('https://beta.test/me?t={{token}}')
  })
})
