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

/**
 * A disk the bridge can save collections to, the way main does: files land
 * under /Docs/Tiger/<name> and come back as an opened-collection payload.
 */
export async function fakeDisk() {
  const { parseRequest } = await import('../../src/core/tigerFormat')
  const { parseEnvironment } = await import('../../src/core/environment')
  const { parseCollectionSettings } = await import('../../src/core/collectionSettings')
  const files = new Map<string, string>()
  const saveCollection = vi.fn(async (name: string, written: Array<{ path: string; content: string }>) => {
    let root = `/Docs/Tiger/${name}`
    for (let n = 2; [...files.keys()].some((k) => k.startsWith(`${root}/`)); n++) root = `/Docs/Tiger/${name} ${n}`
    for (const f of written) files.set(`${root}/${f.path}`, f.content)
    const under = [...files.entries()].filter(([k]) => k.startsWith(`${root}/`))
    const rel = (k: string) => k.slice(root.length + 1)
    const requests = under
      .filter(([k]) => k.endsWith('.tiger') && !k.startsWith(`${root}/environments/`))
      .filter(([k]) => !/(^|\/)(folder|collection)\.tiger$/.test(rel(k)))
      .map(([k, v]) => {
        const r = parseRequest(v)
        return { name: r.name, method: r.method, seq: r.seq, path: k, folder: rel(k).split('/').slice(0, -1) }
      })
      .sort(
        (a, b) =>
          a.folder.join('/').localeCompare(b.folder.join('/')) || (a.seq ?? 1e9) - (b.seq ?? 1e9)
      )
    return {
      root,
      name,
      requests,
      environments: under
        .filter(([k]) => k.startsWith(`${root}/environments/`))
        .map(([k, v]) => ({ name: parseEnvironment(v).name, path: k })),
      settings: parseCollectionSettings(files.get(`${root}/collection.tiger`) ?? ''),
      folders: under
        .filter(([k]) => rel(k).endsWith('/folder.tiger'))
        .map(([k, v]) => ({ folder: rel(k).split('/').slice(0, -1), ...parseCollectionSettings(v) }))
    }
  })
  return {
    files,
    saveCollection,
    readFile: vi.fn(async (path: string) => {
      const text = files.get(path)
      if (text === undefined) throw new Error(`ENOENT: ${path}`)
      return text
    }),
    writeFile: vi.fn(async (path: string, content: string) => {
      files.set(path, content)
      return true
    })
  }
}
