import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ResponsePanel } from '../../src/renderer/src/components/ResponsePanel'
import { formatResponse } from '../../src/core/response'

const json = (body: string, status = 200, statusText = 'OK') =>
  formatResponse({
    status,
    statusText,
    headers: { 'content-type': 'application/json', 'x-one': '1' },
    body,
    timeMs: 7
  })

describe('ResponsePanel accessibility', () => {
  it('states the outcome in words, not only color', () => {
    render(<ResponsePanel state={{ loading: false, data: json('{}', 404, '') }} />)
    const status = document.querySelector('.resp-status') as HTMLElement
    expect(status.textContent).toContain('404 Client error')
    expect(
      screen.getAllByRole('status').some((el) => /Response 404 Client error, 7 milliseconds/.test(el.textContent ?? ''))
    ).toBe(true)
  })

  it('exposes sections as tabs with counts and arrow-key navigation', () => {
    render(<ResponsePanel state={{ loading: false, data: json('{"a":1}') }} />)
    const body = screen.getByRole('tab', { name: 'Body' })
    expect(body).toHaveAttribute('aria-selected', 'true')
    const headers = screen.getByRole('tab', { name: 'Headers, 2' })
    body.focus()
    fireEvent.keyDown(body, { key: 'ArrowRight' })
    expect(headers).toHaveAttribute('aria-selected', 'true')
    expect(headers).toHaveFocus()
    expect(screen.getByRole('tabpanel', { name: 'Headers, 2' })).toBeInTheDocument()
    expect(screen.getByText('x-one').tagName).toBe('DT')
    fireEvent.keyDown(headers, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Cookies, 0' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Cookies, 0' }), { key: 'ArrowRight' })
    expect(body).toHaveFocus()
  })

  it('makes the body a keyboard-scrollable, labelled region', () => {
    render(<ResponsePanel state={{ loading: false, data: json('{"a":1}') }} />)
    const region = screen.getByRole('region', { name: /Response body, JSON/ })
    expect(region).toHaveAttribute('tabindex', '0')
  })

  it('search overlay: labelled input, live count, Enter/Shift+Enter, Esc returns focus', () => {
    render(<ResponsePanel state={{ loading: false, data: json('{"a":"tiger","b":"tiger","c":"tiger"}') }} />)
    const toggle = screen.getByRole('button', { name: 'Search in response' })
    toggle.focus()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    const input = screen.getByRole('textbox', { name: 'Search in response' })
    expect(screen.getByRole('search')).toContainElement(input)
    fireEvent.change(input, { target: { value: 'tiger' } })
    const live = () =>
      screen.getAllByRole('status').find((el) => /Match|No matches/.test(el.textContent ?? ''))!
    expect(live()).toHaveTextContent('Match 1 of 3')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(live()).toHaveTextContent('Match 2 of 3')
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(live()).toHaveTextContent('Match 3 of 3')
    fireEvent.change(input, { target: { value: 'zebra' } })
    expect(live()).toHaveTextContent('No matches')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('search')).not.toBeInTheDocument()
    return new Promise<void>((resolve) =>
      setTimeout(() => {
        expect(screen.getByRole('button', { name: 'Search in response' })).toHaveFocus()
        resolve()
      }, 5)
    )
  })

  it('titles the HTML preview and describes the image preview', () => {
    const html = formatResponse({
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/html' },
      body: '<p>x</p>',
      timeMs: 1
    })
    const { unmount } = render(<ResponsePanel state={{ loading: false, data: html }} />)
    expect(screen.getByTitle(/HTML response preview/)).toBeInTheDocument()
    unmount()
    const img = formatResponse({
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'image/png' },
      body: 'x',
      bodyBase64: 'aGVsbG8=',
      timeMs: 1
    })
    render(<ResponsePanel state={{ loading: false, data: img }} />)
    expect(screen.getByRole('img', { name: /Response image \(image\/png/ })).toBeInTheDocument()
  })

  it('announces failures as an alert', () => {
    render(<ResponsePanel state={{ loading: false, error: 'ECONNREFUSED' }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Request failed')
    expect(screen.getByRole('alert')).toHaveTextContent('ECONNREFUSED')
  })
})
