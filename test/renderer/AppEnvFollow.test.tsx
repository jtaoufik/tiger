import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../src/renderer/src/App'
import type { ImportResult } from '../../src/core/import/types'
import {
  bridge,
  collection,
  environmentOnly,
  envPicker,
  importVia,
  installMatchMedia,
  lastSentUrl,
  pickedEnv,
  sidebar
} from './appHarness'

// The real analytics module pulls in Firebase.
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

describe('the environment follows the request’s collection', () => {
  it('sends a request with its own collection’s environment, not the last imported one', async () => {
    const b = bridge([
      collection('Alpha', 'Get alpha', 'https://alpha.test'),
      collection('Beta', 'Get beta', 'https://beta.test')
    ])
    ;(window as { tiger?: unknown }).tiger = b
    render(<App />)
    await importVia('Postman')
    await importVia('Postman')
    expect(pickedEnv()).toBe('Beta env')

    fireEvent.click(within(sidebar()).getByText('Get alpha'))
    await waitFor(() => expect(pickedEnv()).toBe('Alpha env'))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(b.send).toHaveBeenCalled())
    expect(lastSentUrl(b)).toBe('https://alpha.test/get-alpha')
  })

  it('selects an environment imported on its own, so the open collection resolves at once', async () => {
    const b = bridge([collection('Alpha', 'Get alpha'), environmentOnly('Alpha dev', 'https://alpha.test')])
    ;(window as { tiger?: unknown }).tiger = b
    render(<App />)
    await importVia('Postman')
    await importVia('Postman')
    expect(pickedEnv()).toBe('Alpha dev')

    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(b.send).toHaveBeenCalled())
    expect(lastSentUrl(b)).toBe('https://alpha.test/get-alpha')
  })

  it('remembers each collection’s choice when moving between them', async () => {
    const b = bridge([
      collection('Alpha', 'Get alpha', 'https://alpha.test'),
      collection('Beta', 'Get beta', 'https://beta.test')
    ])
    ;(window as { tiger?: unknown }).tiger = b
    render(<App />)
    await importVia('Postman')
    await importVia('Postman')

    fireEvent.click(within(sidebar()).getByText('Get alpha'))
    await waitFor(() => expect(pickedEnv()).toBe('Alpha env'))
    fireEvent.change(envPicker(), { target: { value: '' } })
    expect(pickedEnv()).toBe('No environment')

    fireEvent.click(within(sidebar()).getByText('Get beta'))
    await waitFor(() => expect(pickedEnv()).toBe('Beta env'))
    fireEvent.click(within(sidebar()).getByText('Get alpha'))
    await waitFor(() => expect(pickedEnv()).toBe('No environment'))
  })
})

describe('which environment an import selects', () => {
  const withEnvs = (...names: string[]): ImportResult => ({
    ...collection('Alpha', 'Get alpha'),
    environments: names.map((name) => ({
      name,
      variables: [{ name: 'host', value: `https://${name.toLowerCase()}.test`, enabled: true }]
    }))
  })

  it('never selects a production environment by itself', async () => {
    ;(window as { tiger?: unknown }).tiger = bridge([withEnvs('Production', 'Local')])
    render(<App />)
    await importVia('Postman')
    expect(pickedEnv()).toBe('Local')
  })

  it('selects none, and says why, when every imported environment is production', async () => {
    ;(window as { tiger?: unknown }).tiger = bridge([withEnvs('Prod')])
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    fireEvent.click([...document.querySelectorAll<HTMLButtonElement>('.modal button.choice')][0])
    expect(await screen.findByText(/did not select "Prod"/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(pickedEnv()).toBe('No environment')
  })

  it('layers the collection’s own variables into an environment imported afterwards', async () => {
    const withVars: ImportResult = {
      ...collection('Alpha', 'Get alpha'),
      collectionVariables: [{ name: 'host', value: 'https://alpha.test', enabled: true }]
    }
    const dev: ImportResult = {
      name: 'Alpha dev',
      source: 'postman',
      requests: [],
      environments: [{ name: 'Alpha dev', variables: [{ name: 'token', value: 'abc', enabled: true }] }]
    }
    const b = bridge([withVars, dev])
    ;(window as { tiger?: unknown }).tiger = b
    render(<App />)
    await importVia('Postman')
    expect(pickedEnv()).toBe('Alpha variables')
    await importVia('Postman')
    expect(pickedEnv()).toBe('Alpha dev')
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(b.send).toHaveBeenCalled())
    expect(lastSentUrl(b)).toBe('https://alpha.test/get-alpha')
  })
})

describe('actions on a request or collection that is not the active one', () => {
  async function twoCollectionsAlphaActive() {
    const b = bridge([
      collection('Alpha', 'Get alpha', 'https://alpha.test'),
      collection('Beta', 'Get beta', 'https://beta.test')
    ])
    ;(window as { tiger?: unknown }).tiger = b
    render(<App />)
    await importVia('Postman')
    await importVia('Postman')
    fireEvent.click(within(sidebar()).getByText('Get alpha'))
    await waitFor(() => expect(pickedEnv()).toBe('Alpha env'))
    return b
  }

  it('runs a collection with that collection’s environment', async () => {
    const b = await twoCollectionsAlphaActive()
    fireEvent.contextMenu(within(sidebar()).getByText('Beta').closest('.col-head')!)
    fireEvent.click(screen.getByText(/^Run collection/))
    fireEvent.click(await screen.findByRole('button', { name: 'Run 1 request' }))
    await waitFor(() => expect(b.send).toHaveBeenCalled())
    expect(lastSentUrl(b)).toBe('https://beta.test/get-beta')
  })

  it('saves what a run’s scripts set into the environment of the collection that ran', async () => {
    const { runScript } = await import('../../src/core/script')
    const beta = collection('Beta', 'Get beta', 'https://beta.test')
    beta.requests[0].request.url = '{{host}}/get-beta?token={{token}}'
    beta.requests[0].request.postScript = "pm.environment.set('token', 'from-run')"
    const b = Object.assign(bridge([collection('Alpha', 'Get alpha', 'https://alpha.test'), beta]), {
      runScript: vi.fn(async (job: { source: string }) => runScript(job.source, job as never))
    })
    ;(window as { tiger?: unknown }).tiger = b
    render(<App />)
    await importVia('Postman')
    await importVia('Postman')
    fireEvent.click(within(sidebar()).getByText('Get alpha'))
    await waitFor(() => expect(pickedEnv()).toBe('Alpha env'))

    fireEvent.contextMenu(within(sidebar()).getByText('Beta').closest('.col-head')!)
    fireEvent.click(screen.getByText(/^Run collection/))
    fireEvent.click(await screen.findByRole('button', { name: 'Run 1 request' }))
    await screen.findByText('1 passed · 0 failed')
    fireEvent.click(within(document.querySelector('.modal-foot') as HTMLElement).getByRole('button', { name: 'Close' }))
    // Alpha's environment, the active one during the run, did not get it.
    expect(pickedEnv()).toBe('Alpha env')

    fireEvent.click(within(sidebar()).getByText('Get beta'))
    await waitFor(() => expect(pickedEnv()).toBe('Beta env'))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(b.send).toHaveBeenCalledTimes(2))
    expect(lastSentUrl(b)).toBe('https://beta.test/get-beta?token=from-run')
  })

  it('exports the collection whose menu was used, with that collection’s variables', async () => {
    const b = await twoCollectionsAlphaActive()
    const exportCollection = b.exportCollection
    fireEvent.contextMenu(within(sidebar()).getByText('Beta').closest('.col-head')!)
    fireEvent.click(screen.getByText(/^Export/))
    const choice = [...document.querySelectorAll<HTMLButtonElement>('.modal button.choice')].find((el) =>
      el.textContent?.startsWith('Postman collection')
    )
    fireEvent.click(choice!)
    await waitFor(() => expect(exportCollection).toHaveBeenCalled())
    const [filename, json] = exportCollection.mock.calls[0]
    expect(filename).toBe('Beta.postman_collection.json')
    expect(json).toContain('https://beta.test')
    expect(json).not.toContain('https://alpha.test')
    expect(b.send).not.toHaveBeenCalled()
  })

  it('copies a request as curl with its own collection’s environment', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await twoCollectionsAlphaActive()
    fireEvent.contextMenu(within(sidebar()).getByText('Get beta'))
    fireEvent.click(screen.getByText('Copy as curl'))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(writeText.mock.calls[0][0]).toContain('https://beta.test/get-beta')
  })
})
