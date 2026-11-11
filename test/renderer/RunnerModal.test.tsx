import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { setLocale } from '../../src/renderer/src/i18n'
import { RunnerModal } from '../../src/renderer/src/components/RunnerModal'
import type { RunnerItem } from '../../src/core/runner'

const item = (id: string, name: string): RunnerItem => ({
  id,
  name,
  request: { name, method: 'get', url: 'https://x.test', headers: [], query: [], body: { type: 'none', content: '' } }
})

describe('RunnerModal', () => {
  it('lists requests in a table with column headers and a primary Run action', async () => {
    render(
      <RunnerModal
        title="Demo"
        loadItems={async () => [item('1', 'List users'), item('2', 'Get user')]}
        environment={null}
        timeoutMs={1000}
        onClose={() => {}}
      />
    )
    const table = await screen.findByRole('table', { name: /Requests in this run/ })
    expect(table).toBeInTheDocument()
    for (const col of ['Method', 'Request', 'Status', 'Time', 'Tests', 'Result']) {
      expect(screen.getByRole('columnheader', { name: col })).toBeInTheDocument()
    }
    expect(screen.getByRole('rowheader', { name: 'List users' })).toBeInTheDocument()
    expect(screen.getAllByText('Pending')).toHaveLength(2)
    const run = screen.getByRole('button', { name: 'Run 2 requests' })
    const close = within(document.querySelector('.modal-foot') as HTMLElement).getByRole('button', { name: 'Close' })
    expect(close.compareDocumentPosition(run) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows an empty state with an action when there is nothing to run', async () => {
    render(
      <RunnerModal title="Empty" loadItems={async () => []} environment={null} timeoutMs={1000} onClose={() => {}} />
    )
    expect(await screen.findByText('Nothing to run yet')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Close' }).length).toBeGreaterThan(0)
  })

  afterEach(async () => {
    await act(() => setLocale('en'))
  })

  it('renders in French and Arabic', async () => {
    const props = {
      title: 'Demo',
      loadItems: async () => [item('1', 'List users'), item('2', 'Get user')],
      environment: null,
      timeoutMs: 1000,
      onClose: () => {}
    }
    await act(() => setLocale('fr'))
    const { unmount } = render(<RunnerModal {...props} />)
    expect(await screen.findByRole('button', { name: 'Exécuter 2 requêtes' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Méthode' })).toBeInTheDocument()
    expect(screen.getAllByText('En attente')).toHaveLength(2)
    unmount()
    await act(() => setLocale('ar'))
    render(<RunnerModal {...props} />)
    expect(await screen.findByRole('button', { name: 'تشغيل 2 طلبين' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'الحالة' })).toBeInTheDocument()
  })
})

describe('RunnerModal variables', () => {
  afterEach(() => {
    delete (window as unknown as { tiger?: unknown }).tiger
  })

  it('hands back the variables the run set, so they are saved to the environment', async () => {
    const { runScript } = await import('../../src/core/script')
    ;(window as unknown as { tiger: unknown }).tiger = {
      runScript: async (job: { source: string; vars: Record<string, string>; response?: unknown }) =>
        runScript(job.source, job as never),
      send: async () => ({ status: 200, statusText: 'OK', headers: {}, body: '{"token":"t-9"}', timeMs: 2 }),
      cancelSend: async () => true
    }
    const login: RunnerItem = {
      id: 'login',
      name: 'Login',
      request: {
        name: 'Login',
        method: 'post',
        url: 'https://x.test/login',
        headers: [],
        query: [],
        body: { type: 'none', content: '' },
        postScript: "pm.environment.set('token', pm.response.json().token)"
      }
    }
    const changed: Array<{ name: string; value: string }>[] = []
    render(
      <RunnerModal
        title="Auth"
        loadItems={async () => [login]}
        environment={{ name: 'dev', variables: [{ name: 'token', value: 'old', enabled: true }] }}
        onVariablesChanged={(c) => changed.push(c)}
        timeoutMs={1000}
        onClose={() => {}}
      />
    )
    const run = await screen.findByRole('button', { name: 'Run 1 request' })
    await act(async () => run.click())
    await screen.findByText('1 passed · 0 failed')
    expect(changed).toEqual([[{ name: 'token', value: 't-9' }]])
  })

  it('closing the dialog mid-run aborts the in-flight send and runs nothing more', async () => {
    const release: Array<() => void> = []
    const send = vi.fn(
      () =>
        new Promise<{ status: number; statusText: string; headers: Record<string, string>; body: string; timeMs: number }>(
          (resolve) => {
            release.push(() => resolve({ status: 200, statusText: 'OK', headers: {}, body: '{}', timeMs: 1 }))
          }
        )
    )
    const cancelSend = vi.fn(async () => true)
    ;(window as unknown as { tiger: unknown }).tiger = { send, cancelSend }
    const changed: unknown[] = []
    const { unmount } = render(
      <RunnerModal
        title="Two"
        loadItems={async () => [item('1', 'First'), item('2', 'Second')]}
        environment={null}
        onVariablesChanged={(c) => changed.push(c)}
        timeoutMs={1000}
        onClose={() => {}}
      />
    )
    const run = await screen.findByRole('button', { name: 'Run 2 requests' })
    await act(async () => run.click())
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))

    unmount()
    expect(cancelSend).toHaveBeenCalledWith('collection-runner')

    // The first send settles after the close; the runner must not start the second.
    await act(async () => {
      for (const r of release.splice(0)) r()
      await Promise.resolve()
    })
    await new Promise((r) => setTimeout(r, 10))
    expect(send).toHaveBeenCalledTimes(1)
    expect(changed).toEqual([])
  })
})
