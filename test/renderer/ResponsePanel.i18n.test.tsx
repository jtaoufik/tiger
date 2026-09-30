import { afterEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { ResponsePanel } from '../../src/renderer/src/components/ResponsePanel'
import { setLocale } from '../../src/renderer/src/i18n'
import { formatResponse } from '../../src/core/response'

const data = formatResponse({
  status: 200,
  statusText: 'OK',
  headers: { 'content-type': 'application/json' },
  body: '{"a":1}',
  timeMs: 7
})

describe('ResponsePanel translations', () => {
  afterEach(async () => {
    await act(() => setLocale('en'))
  })

  it('renders the empty state in French', async () => {
    await act(() => setLocale('fr'))
    render(<ResponsePanel state={undefined} />)
    expect(screen.getByRole('region', { name: 'Réponse' })).toBeInTheDocument()
    expect(screen.getByText('Prêt quand vous l’êtes')).toBeInTheDocument()
  })

  it('renders a response with a failing test in French, with plurals', async () => {
    await act(() => setLocale('fr'))
    render(
      <ResponsePanel
        state={{
          loading: false,
          data,
          tests: [
            { name: 'a', passed: true },
            { name: 'b', passed: false, error: 'boom' }
          ]
        }}
      />
    )
    expect(screen.getByText('Durée')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Tests, 1 sur 2 réussis' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Tests, 1 sur 2 réussis' }))
    expect(await screen.findByText('1 sur 2 réussis, 1 en échec')).toBeInTheDocument()
    expect(screen.getByText('ÉCHEC')).toBeInTheDocument()
  })

  it('renders Arabic labels', async () => {
    await act(() => setLocale('ar'))
    render(<ResponsePanel state={{ loading: false, data }} />)
    expect(screen.getByRole('region', { name: 'الاستجابة' })).toBeInTheDocument()
    expect(screen.getByText('الوقت')).toBeInTheDocument()
  })
})
