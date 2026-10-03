import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../src/renderer/src/App'
import type { ImportResult } from '../../src/core/import/types'

// The real analytics module pulls in Firebase.
vi.mock('../../src/renderer/src/analytics', () => ({
  initAnalytics: vi.fn().mockResolvedValue(undefined),
  setAnalyticsEnabled: vi.fn(),
  trackEvent: vi.fn()
}))

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false
  })) as unknown as typeof window.matchMedia
})

/** One top-level GET request per collection, its host taken from {{host}}. */
function collection(name: string, request: string, host?: string): ImportResult {
  return {
    name,
    source: 'postman',
    requests: [
      {
        path: [],
        request: {
          name: request,
          method: 'get',
          url: `{{host}}/${request.toLowerCase().replace(/\s+/g, '-')}`,
          headers: [],
          query: [],
          body: { type: 'none', content: '' }
        }
      }
    ],
    ...(host
      ? { environments: [{ name: `${name} env`, variables: [{ name: 'host', value: host, enabled: true }] }] }
      : {})
  }
}

function environmentOnly(envName: string, host: string): ImportResult {
  return {
    name: envName,
    source: 'postman',
    requests: [],
    environments: [{ name: envName, variables: [{ name: 'host', value: host, enabled: true }] }]
  }
}

function bridge(imports: ImportResult[]) {
  const queue = [...imports]
  return {
    importCollection: vi.fn(async () => queue.shift() ?? null),
    send: vi.fn(async (_built: { url: string }, _timeoutMs?: number, _cancelKey?: string) => ({
      status: 200,
      statusText: 'OK',
      headers: {},
      body: '{}',
      timeMs: 1
    })),
    getSettings: vi.fn().mockResolvedValue({ theme: 'system', timeoutMs: 30000, fontSize: 13, analyticsEnabled: false }),
    version: vi.fn().mockResolvedValue('test'),
    checkUpdate: vi.fn().mockResolvedValue(null),
    onUpdateDownloaded: vi.fn(),
    onShortcut: vi.fn(),
    historyRead: vi.fn().mockResolvedValue([]),
    historyAppend: vi.fn(),
    track: vi.fn()
  }
}

async function importVia(source: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Import' }))
  const choice = [...document.querySelectorAll<HTMLButtonElement>('.modal button.choice')].find((b) =>
    b.textContent?.startsWith(source)
  )
  fireEvent.click(choice!)
  fireEvent.click(await screen.findByRole('button', { name: 'Done' }))
}

const sidebar = () => document.querySelector('.sidebar') as HTMLElement
const envPicker = () => screen.getByLabelText('Active environment') as HTMLSelectElement
const pickedEnv = () => envPicker().selectedOptions[0]?.textContent

/** The URL the last send put on the wire. */
const lastSentUrl = (b: ReturnType<typeof bridge>) => b.send.mock.calls.at(-1)?.[0].url

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
    const b = bridge([collection('Alpha', 'Get alpha'), environmentOnly('Alpha prod', 'https://alpha.test')])
    ;(window as { tiger?: unknown }).tiger = b
    render(<App />)
    await importVia('Postman')
    await importVia('Postman')
    expect(pickedEnv()).toBe('Alpha prod')

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

  it('exports the collection whose menu was used, with that collection’s variables', async () => {
    const b = await twoCollectionsAlphaActive()
    const exportCollection = vi.fn(async (_filename: string, _text: string) => '/tmp/out.json')
    ;(window as { tiger?: Record<string, unknown> }).tiger!.exportCollection = exportCollection
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
