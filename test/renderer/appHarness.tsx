import { vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import type { ImportResult } from '../../src/core/import/types'

/** Separator inside request and environment ids. */
export const SEP = '\u001f'

export function installMatchMedia(): void {
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
}

/** One top-level GET request per collection, its host taken from {{host}}. */
export function collection(name: string, request: string, host?: string): ImportResult {
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

export function environmentOnly(envName: string, host: string): ImportResult {
  return {
    name: envName,
    source: 'postman',
    requests: [],
    environments: [{ name: envName, variables: [{ name: 'host', value: host, enabled: true }] }]
  }
}

/** The Electron bridge, with imports served from a queue and sends answered 200. */
export function bridge(imports: ImportResult[], history: unknown[] = []) {
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
    exportCollection: vi.fn(async (_filename: string, _text: string) => '/tmp/out.json'),
    getSettings: vi.fn().mockResolvedValue({ theme: 'system', timeoutMs: 30000, fontSize: 13, analyticsEnabled: false }),
    version: vi.fn().mockResolvedValue('test'),
    checkUpdate: vi.fn().mockResolvedValue(null),
    onUpdateDownloaded: vi.fn(),
    onShortcut: vi.fn(),
    historyRead: vi.fn().mockResolvedValue(history),
    historyAppend: vi.fn(),
    track: vi.fn()
  }
}

export async function importVia(source: string): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Import' }))
  const choice = [...document.querySelectorAll<HTMLButtonElement>('.modal button.choice')].find((b) =>
    b.textContent?.startsWith(source)
  )
  fireEvent.click(choice!)
  fireEvent.click(await screen.findByRole('button', { name: 'Done' }))
}

export const sidebar = () => document.querySelector('.sidebar') as HTMLElement
export const envPicker = () => screen.getByLabelText('Active environment') as HTMLSelectElement
export const pickedEnv = () => envPicker().selectedOptions[0]?.textContent

/** The URL the last send put on the wire. */
export const lastSentUrl = (b: ReturnType<typeof bridge>) => b.send.mock.calls.at(-1)?.[0].url
