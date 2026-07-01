import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ResponsePanel } from '../../src/renderer/src/components/ResponsePanel'
import { formatResponse } from '../../src/core/response'

const json = (body: string) =>
  formatResponse({
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    body,
    timeMs: 7
  })

describe('ResponsePanel power tools', () => {
  it('opens in-response search with Cmd+F, counts and cycles matches', () => {
    render(<ResponsePanel state={{ loading: false, data: json('{"a":"tiger","b":"tiger"}') }} />)
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true })
    const input = screen.getByPlaceholderText('Search in response')
    fireEvent.change(input, { target: { value: 'tiger' } })
    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(document.querySelectorAll('mark.hit')).toHaveLength(2)
    expect(document.querySelectorAll('mark.hit.active')).toHaveLength(1)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('2/2')).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('1/2')).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByPlaceholderText('Search in response')).not.toBeInTheDocument()
  })

  it('renders a sandboxed iframe preview for HTML responses', () => {
    const data = formatResponse({
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: '<h1>Hello</h1>',
      timeMs: 3
    })
    render(<ResponsePanel state={{ loading: false, data }} />)
    const frame = document.querySelector('iframe.html-preview') as HTMLIFrameElement
    expect(frame).toBeTruthy()
    expect(frame.getAttribute('sandbox')).toBe('')
    // Raw toggle goes back to text
    fireEvent.click(screen.getByRole('button', { name: 'Raw' }))
    expect(document.querySelector('iframe.html-preview')).toBeNull()
  })

  it('truncates very large bodies in the DOM and shows a banner', () => {
    // 3 MB plain-text response: above the 1 MB DOM render cap, below the
    // 2 MB pretty-print cap (content-type is text/plain so isJson is false anyway).
    // We tag the tail with a unique marker that must NOT appear in the DOM.
    const filler = 'x'.repeat(3_000_000 - 'TAIL_MARKER_ZZZ'.length)
    const data = formatResponse({
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/plain' },
      body: filler + 'TAIL_MARKER_ZZZ',
      timeMs: 4
    })
    render(<ResponsePanel state={{ loading: false, data }} />)
    expect(document.querySelector('.resp-truncated')).toBeTruthy()
    expect(document.body.textContent).not.toContain('TAIL_MARKER_ZZZ')
  })

  it('renders an image preview from the base64 body', () => {
    const data = formatResponse({
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'image/png' },
      body: 'binaryjunk',
      bodyBase64: 'aGVsbG8=',
      timeMs: 3
    })
    render(<ResponsePanel state={{ loading: false, data }} />)
    const img = document.querySelector('.img-preview img') as HTMLImageElement
    expect(img).toBeTruthy()
    expect(img.src).toBe('data:image/png;base64,aGVsbG8=')
  })
})
