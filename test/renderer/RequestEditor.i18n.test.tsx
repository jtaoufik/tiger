import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { TigerRequest } from '../../src/core/types'
import { RequestEditor } from '../../src/renderer/src/components/RequestEditor'
import { AuthEditor } from '../../src/renderer/src/components/AuthEditor'
import { setLocale } from '../../src/renderer/src/i18n'

const base: TigerRequest = {
  name: 'Get user',
  method: 'get',
  url: 'https://api.example.com/users/1',
  headers: [{ name: 'Accept', value: 'application/json', enabled: true }],
  query: [],
  body: { type: 'json', content: '{"a":' },
  preScript: 'tiger.log(1)'
}

function Harness({ missing = [] as string[] }) {
  const [request, setRequest] = useState(base)
  return (
    <RequestEditor
      request={request}
      sending={false}
      diskBacked
      dirty
      missingVars={missing}
      onChange={setRequest}
      onSend={() => {}}
      onCancel={() => {}}
      onSave={() => {}}
      getBuilt={() => null}
      perf={{ collectionAuth: undefined, env: null, timeoutMs: 1000 }}
    />
  )
}

describe('RequestEditor translations', () => {
  afterEach(async () => {
    await act(() => setLocale('en'))
  })

  it('renders the URL bar, tabs and flags in French', async () => {
    await act(() => setLocale('fr'))
    render(<Harness missing={['token']} />)
    expect(screen.getByRole('textbox', { name: 'Nom de la requête' })).toHaveValue('Get user')
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Enregistrer la requête (modifications non enregistrées)' })
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'URL de la requête' })).toBeInTheDocument()
    expect(screen.getByText(/Variables non résolues : \{\{token\}\}/)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'En-têtes, 1' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Scripts et tests, contient des scripts' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /^Corps, json/ }))
    expect(screen.getByText('JSON invalide')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'aucun' })).toBeInTheDocument()
  })

  it('renders the key/value rows in Arabic', async () => {
    await act(() => setLocale('ar'))
    render(<Harness />)
    fireEvent.click(screen.getByRole('tab', { name: /^الترويسات/ }))
    expect(screen.getByRole('textbox', { name: 'اسم ترويسة 1' })).toHaveValue('Accept')
    expect(screen.getByRole('button', { name: 'إضافة ترويسة' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إرسال' })).toBeInTheDocument()
  })

  it('renders the auth editor in French', async () => {
    await act(() => setLocale('fr'))
    render(<AuthEditor auth={{ type: 'bearer', token: '' }} onChange={() => {}} />)
    expect(screen.getByRole('option', { name: 'Hériter de la collection' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Clé API' })).toBeInTheDocument()
    expect(screen.getByLabelText('Jeton')).toBeInTheDocument()
    expect(screen.getByText('Envoyé sous la forme Authorization: Bearer <token>.')).toBeInTheDocument()
  })
})
