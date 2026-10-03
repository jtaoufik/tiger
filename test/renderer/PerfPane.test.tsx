import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PerfPane } from '../../src/renderer/src/components/PerfPane'
import type { TigerRequest } from '../../src/core/types'

afterEach(() => {
  delete (window as { tiger?: unknown }).tiger
})

const ok = async () => ({ status: 201, statusText: 'Created', headers: {}, body: '{}', timeMs: 1 })

describe('Load test', () => {
  it('gives {{$guid}}-style variables a fresh value on every request it fires', async () => {
    const send = vi.fn(ok)
    ;(window as { tiger?: unknown }).tiger = { send }
    const request: TigerRequest = {
      name: 'Create order',
      method: 'post',
      url: 'https://api.test/orders',
      headers: [{ name: 'Idempotency-Key', value: '{{$guid}}', enabled: true }],
      query: [],
      body: { type: 'json', content: '{"ref":"{{$randomInt}}"}' }
    }
    render(<PerfPane request={request} collectionAuth={undefined} env={null} timeoutMs={1000} />)
    fireEvent.change(screen.getByLabelText('Total requests'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /^Run 5 requests/ }))
    await waitFor(() => expect(send).toHaveBeenCalledTimes(5))
    const keys = new Set(send.mock.calls.map((c) => (c as unknown as [{ headers: Record<string, string> }])[0].headers['Idempotency-Key']))
    expect(keys.size).toBe(5)
  })

  it('keeps its sends out of the history, and asks for one OAuth2 token for the whole run', async () => {
    const send = vi.fn(ok)
    const oauthToken = vi.fn(async () => 'tok')
    ;(window as { tiger?: unknown }).tiger = { send, oauthToken }
    const request: TigerRequest = {
      name: 'Me',
      method: 'get',
      url: 'https://api.test/me',
      headers: [],
      query: [],
      body: { type: 'none', content: '' },
      auth: { type: 'oauth2', grantType: 'client_credentials', tokenUrl: 'https://login.test/t', clientId: 'c', clientSecret: 's', scope: '' }
    }
    render(<PerfPane request={request} collectionAuth={undefined} env={null} timeoutMs={1000} />)
    fireEvent.change(screen.getByLabelText('Total requests'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: /^Run 3 requests/ }))
    await waitFor(() => expect(send).toHaveBeenCalledTimes(3))
    expect(oauthToken).toHaveBeenCalledTimes(1)
    for (const call of send.mock.calls as unknown as Array<[{ headers: Record<string, string> }, number, unknown, { record?: boolean }]>) {
      expect(call[0].headers.Authorization).toBe('Bearer tok')
      expect(call[3]).toEqual({ record: false })
    }
  })
})
