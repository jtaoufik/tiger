import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from '../../src/renderer/src/ErrorBoundary'

function Thrower({ fail }: { fail: boolean }) {
  if (fail) throw new Error('boom from render')
  return <p>fine</p>
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Thrower fail={false} />
      </ErrorBoundary>
    )
    expect(screen.getByText('fine')).toBeInTheDocument()
  })

  it('shows the crash panel with the message and a Reload button instead of a blank tree', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Thrower fail />
      </ErrorBoundary>
    )
    const panel = screen.getByRole('alert')
    expect(panel).toHaveTextContent('Something went wrong')
    expect(panel).toHaveTextContent('boom from render')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(screen.queryByText('fine')).not.toBeInTheDocument()
    // The error is logged (React reports it too, so at least once with our prefix).
    expect(log.mock.calls.some((c) => String(c[0]).includes('unrecoverable render error'))).toBe(true)
  })
})
