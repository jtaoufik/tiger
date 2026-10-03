import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../../src/renderer/src/App'
import type { ImportResult } from '../../src/core/import/types'
import { bridge, collection, envPicker, fakeDisk, importVia, installMatchMedia, lastSentUrl, pickedEnv, sidebar } from './appHarness'

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

/** A Postman-like import: folder auth, an environment, two folders. */
function shop(): ImportResult {
  const request = (name: string, url: string) => ({
    name,
    method: 'get' as const,
    url,
    headers: [],
    query: [],
    body: { type: 'none' as const, content: '' }
  })
  return {
    name: 'Shop',
    source: 'postman',
    requests: [
      { path: [], request: request('Health', '{{host}}/health') },
      { path: ['Orders'], request: request('List orders', '{{host}}/orders') },
      { path: ['Orders'], request: request('Get order', '{{host}}/orders/1') }
    ],
    folders: [{ path: ['Orders'], auth: { type: 'bearer', token: '{{token}}' } }],
    environments: [
      {
        name: 'Shop dev',
        variables: [
          { name: 'host', value: 'https://shop.test', enabled: true },
          { name: 'token', value: 't-1', enabled: true }
        ]
      }
    ]
  }
}

async function importShop() {
  const disk = await fakeDisk()
  const b = Object.assign(bridge([shop()]), disk)
  ;(window as { tiger?: unknown }).tiger = b
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Import' }))
  const choice = [...document.querySelectorAll<HTMLButtonElement>('.modal button.choice')].find((el) =>
    el.textContent?.startsWith('Postman')
  )
  fireEvent.click(choice!)
  await screen.findByText(/Saved in \/Docs\/Tiger\/Shop/)
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  return b
}

describe('an imported collection is saved on disk', () => {
  it('writes it as a folder in Documents/Tiger and opens that folder', async () => {
    const b = await importShop()
    expect(b.saveCollection).toHaveBeenCalledTimes(1)
    expect([...b.files.keys()].sort()).toEqual([
      '/Docs/Tiger/Shop/Health.tiger',
      '/Docs/Tiger/Shop/Orders/Get order.tiger',
      '/Docs/Tiger/Shop/Orders/List orders.tiger',
      '/Docs/Tiger/Shop/Orders/folder.tiger',
      '/Docs/Tiger/Shop/collection.tiger',
      '/Docs/Tiger/Shop/environments/Shop dev.tiger'
    ])
    expect(pickedEnv()).toBe('Shop dev')
  })

  it('saves edits with Ctrl+S, which used to do nothing on an import', async () => {
    const b = await importShop()
    const url = document.querySelector<HTMLInputElement>('.url-input')!
    fireEvent.change(url, { target: { value: '{{host}}/healthz' } })
    fireEvent.keyDown(window, { key: 's', ctrlKey: true, metaKey: true })
    await waitFor(() => expect(b.files.get('/Docs/Tiger/Shop/Health.tiger')).toContain('{{host}}/healthz'))
  })

  it('sends a request with its folder’s auth before the folder page was ever opened', async () => {
    const b = await importShop()
    // Unfold with the chevron: clicking the row would open the folder page.
    const orders = within(sidebar()).getByText('Orders').closest('.folder-row') as HTMLElement
    fireEvent.click(orders.querySelector('.chev-btn')!)
    fireEvent.click(await within(sidebar()).findByText('List orders'))
    expect(b.readFile).not.toHaveBeenCalledWith('/Docs/Tiger/Shop/Orders/folder.tiger')
    await waitFor(() => expect(document.querySelector<HTMLInputElement>('.url-input')!.value).toBe('{{host}}/orders'))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(b.send).toHaveBeenCalled())
    expect(lastSentUrl(b)).toBe('https://shop.test/orders')
    expect(b.send.mock.calls.at(-1)?.[0]).toMatchObject({ headers: { Authorization: 'Bearer t-1' } })
  })

  it('writes an environment imported on its own into the collection’s folder', async () => {
    const disk = await fakeDisk()
    const envOnly: ImportResult = {
      name: 'Shop staging',
      source: 'postman',
      requests: [],
      environments: [{ name: 'Shop staging', variables: [{ name: 'host', value: 'https://staging.test', enabled: true }] }]
    }
    const b = Object.assign(bridge([shop(), envOnly]), disk)
    ;(window as { tiger?: unknown }).tiger = b
    render(<App />)
    await importVia('Postman')
    await importVia('Postman')
    expect(b.files.get('/Docs/Tiger/Shop/environments/Shop staging.tiger')).toContain('host: https://staging.test')
    expect([...envPicker().options].map((o) => o.textContent)).toContain('Shop staging')
  })

  it('keeps it in memory, and says so, when the disk refuses', async () => {
    const disk = await fakeDisk()
    disk.saveCollection.mockRejectedValueOnce(new Error('EACCES: permission denied'))
    const b = Object.assign(bridge([collection('Alpha', 'Get alpha', 'https://alpha.test')]), disk)
    ;(window as { tiger?: unknown }).tiger = b
    render(<App />)
    await importVia('Postman')
    expect(await screen.findByText(/Could not save the import to disk \(EACCES/)).toBeInTheDocument()
    expect(within(sidebar()).getByText('Get alpha')).toBeInTheDocument()
  })
})

describe('a collection that only lives in memory', () => {
  it('is saved to disk from its menu, keeping the open request and environment', async () => {
    const disk = await fakeDisk()
    const b = Object.assign(bridge([]), disk)
    ;(window as { tiger?: unknown }).tiger = b
    render(<App />)
    const demo = await within(sidebar()).findByText('Demo collection')
    fireEvent.click(within(sidebar()).getByText('List posts'))
    await waitFor(() => expect(document.querySelector('.url-input')).not.toBeNull())
    const before = document.querySelector<HTMLInputElement>('.url-input')!.value
    expect(before).toContain('{{baseUrl}}')
    const env = pickedEnv()

    fireEvent.contextMenu(demo.closest('.col-head')!)
    fireEvent.click(screen.getByText('Save to disk'))
    await screen.findByText(/Saved Demo collection in \/Docs\/Tiger\/Demo collection/)

    expect([...b.files.keys()].some((k) => k.startsWith('/Docs/Tiger/Demo collection/'))).toBe(true)
    expect(within(sidebar()).getAllByText('Demo collection')).toHaveLength(1)
    expect(document.querySelector<HTMLInputElement>('.url-input')?.value).toBe(before)
    expect(pickedEnv()).toBe(env)
    // From now on Ctrl+S writes the request file.
    fireEvent.change(document.querySelector<HTMLInputElement>('.url-input')!, { target: { value: 'https://x.test/saved' } })
    fireEvent.keyDown(window, { key: 's', ctrlKey: true, metaKey: true })
    await waitFor(() =>
      expect([...b.files.values()].some((v) => v.includes('url: https://x.test/saved'))).toBe(true)
    )
    expect(b.saveCollection).toHaveBeenCalledTimes(1)
  })

  it('is saved to disk by Ctrl+S, which used to do nothing', async () => {
    const disk = await fakeDisk()
    const b = Object.assign(bridge([]), disk)
    ;(window as { tiger?: unknown }).tiger = b
    render(<App />)
    await within(sidebar()).findByText('Demo collection')
    fireEvent.keyDown(window, { key: 's', ctrlKey: true, metaKey: true })
    await waitFor(() => expect(b.saveCollection).toHaveBeenCalledTimes(1))
  })
})
