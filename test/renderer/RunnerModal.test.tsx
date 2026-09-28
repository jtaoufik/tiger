import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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
})
