import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { TigerRequest } from '../../src/core/types'
import { RequestEditor } from '../../src/renderer/src/components/RequestEditor'

const base: TigerRequest = {
  name: 'Get user',
  method: 'get',
  url: 'https://api.example.com/users/1',
  headers: [
    { name: 'Accept', value: 'application/json', enabled: true },
    { name: 'X-A', value: '1', enabled: true },
    { name: 'X-B', value: '2', enabled: true },
    { name: 'X-C', value: '3', enabled: true }
  ],
  query: [],
  body: { type: 'json', content: '{"a":' }
}

function Harness() {
  const [request, setRequest] = useState(base)
  return (
    <RequestEditor
      request={request}
      sending={false}
      diskBacked={false}
      dirty={false}
      missingVars={[]}
      onChange={setRequest}
      onImportCurl={() => {}}
      onSend={() => {}}
      onCancel={() => {}}
      onSave={() => {}}
      getBuilt={() => null}
      perf={{ collectionAuth: undefined, env: null, timeoutMs: 1000 }}
    />
  )
}

describe('RequestEditor accessibility', () => {
  it('exposes the sections as a tablist with counts in the tab names', () => {
    render(<Harness />)
    const list = screen.getByRole('tablist', { name: 'Request sections' })
    expect(list).toBeInTheDocument()
    const headers = screen.getByRole('tab', { name: 'Headers, 4' })
    expect(headers).toHaveAttribute('aria-selected', 'false')
    const params = screen.getByRole('tab', { name: 'Params' })
    expect(params).toHaveAttribute('aria-selected', 'true')
    expect(params).toHaveAttribute('tabindex', '0')
    expect(headers).toHaveAttribute('tabindex', '-1')
    const panel = screen.getByRole('tabpanel')
    expect(panel).toHaveAttribute('aria-labelledby', params.id)
    expect(params).toHaveAttribute('aria-controls', panel.id)
  })

  it('moves between tabs with arrow keys, Home and End', () => {
    render(<Harness />)
    const params = screen.getByRole('tab', { name: 'Params' })
    params.focus()
    // Body is second: the most used sections come first.
    fireEvent.keyDown(params, { key: 'ArrowRight' })
    const body = screen.getByRole('tab', { name: /^Body/ })
    expect(body).toHaveAttribute('aria-selected', 'true')
    expect(body).toHaveFocus()
    fireEvent.keyDown(body, { key: 'ArrowRight' })
    const headers = screen.getByRole('tab', { name: 'Headers, 4' })
    expect(headers).toHaveAttribute('aria-selected', 'true')
    expect(headers).toHaveFocus()
    expect(screen.getByRole('tabpanel', { name: 'Headers, 4' })).toBeInTheDocument()
    fireEvent.keyDown(headers, { key: 'End' })
    expect(screen.getByRole('tab', { name: 'Load test' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Load test' }), { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Params' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Params' }), { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: 'Load test' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Load test' }), { key: 'Home' })
    expect(screen.getByRole('tab', { name: 'Params' })).toHaveFocus()
  })

  it('labels the URL bar and flags invalid JSON on the body field', () => {
    render(<Harness />)
    expect(screen.getByRole('combobox', { name: 'HTTP method' })).toHaveValue('get')
    expect(screen.getByRole('textbox', { name: 'Request URL' })).toHaveValue(base.url)
    fireEvent.click(screen.getByRole('tab', { name: 'Body, json' }))
    const body = screen.getByRole('textbox', { name: 'Request body (JSON)' })
    expect(body).toHaveAttribute('aria-invalid', 'true')
    expect(body).toHaveAccessibleDescription('Invalid JSON')
    expect(screen.getByRole('button', { name: 'json' })).toHaveAttribute('aria-pressed', 'true')
  })
})
