import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { lazySurface } from '../../src/renderer/src/lazy'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const Hello = ({ name }: { name: string }) => <p>Hello {name}</p>

describe('lazySurface', () => {
  it('announces loading with a status message, then renders the surface', async () => {
    const chunk = deferred<typeof Hello>()
    const Surface = lazySurface(() => chunk.promise, 'the greeting')
    // Awaited act: the swap-in after the chunk resolves is flushed inside it.
    await act(async () => {
      render(<Surface name="Ada" />)
    })
    expect(screen.getByRole('status')).toHaveTextContent('Loading the greeting…')
    await act(async () => chunk.resolve(Hello))
    expect(await screen.findByText('Hello Ada')).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('loads the chunk once, and renders synchronously once loaded', async () => {
    const load = vi.fn(async () => Hello)
    const Surface = lazySurface(load, 'the greeting')
    const first = Surface.preload()
    expect(Surface.preload()).toBe(first)
    await first
    render(<Surface name="Grace" />)
    // No fallback frame at all: the surface is there in the same render.
    expect(screen.getByText('Hello Grace')).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('retries after a failed load', async () => {
    const load = vi
      .fn<() => Promise<typeof Hello>>()
      .mockRejectedValueOnce(new Error('EIO'))
      .mockResolvedValue(Hello)
    const Surface = lazySurface(load, 'the greeting')
    await expect(Surface.preload()).rejects.toThrow('EIO')
    await Surface.preload()
    render(<Surface name="Linus" />)
    expect(screen.getByText('Hello Linus')).toBeInTheDocument()
  })

  it('says so when a chunk cannot be loaded', async () => {
    const Surface = lazySurface<{ name: string }>(() => Promise.reject(new Error('gone')), 'history', true)
    await act(async () => {
      render(<Surface name="x" />)
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load history.')
  })

  it('floats the fallback for dialogs', () => {
    const Surface = lazySurface(() => new Promise<typeof Hello>(() => {}), 'history', true)
    render(<Surface name="x" />)
    expect(screen.getByRole('status')).toHaveClass('lazy-loading', 'overlay')
  })
})
