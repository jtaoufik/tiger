import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { importCurl } from '../../src/core/import/curl'
import type { TigerRequest } from '../../src/core/types'
import { RequestEditor } from '../../src/renderer/src/components/RequestEditor'

const base: TigerRequest = {
  name: 'Untitled',
  method: 'get',
  url: '',
  headers: [],
  query: [],
  body: { type: 'none', content: '' }
}

function paste(input: HTMLElement, text: string) {
  fireEvent.paste(input, { clipboardData: { getData: () => text } })
}

function Harness({ onImportCurl }: { onImportCurl: (command: string) => void }) {
  const [request, setRequest] = useState(base)
  return (
    <RequestEditor
      request={request}
      sending={false}
      diskBacked={false}
      dirty={false}
      missingVars={[]}
      onChange={setRequest}
      onImportCurl={onImportCurl}
      onSend={() => {}}
      onCancel={() => {}}
      onSave={() => {}}
      getBuilt={() => null}
      perf={{ collectionAuth: undefined, env: null, timeoutMs: 1000 }}
    />
  )
}

describe('pasting a curl command into the URL bar', () => {
  it('delegates to onImportCurl instead of setting the raw text as the URL', () => {
    const onImportCurl = vi.fn()
    render(<Harness onImportCurl={onImportCurl} />)
    const url = screen.getByLabelText('Request URL') as HTMLInputElement
    const command = "curl -X POST https://api.example.com/users -H 'Content-Type: application/json' -d '{\"a\":1}'"

    paste(url, command)

    expect(onImportCurl).toHaveBeenCalledWith(command)
    expect(url.value).toBe('')
  })

  it('lets a normal paste set the URL as usual', () => {
    const onImportCurl = vi.fn()
    render(<Harness onImportCurl={onImportCurl} />)
    const url = screen.getByLabelText('Request URL') as HTMLInputElement

    paste(url, 'https://api.example.com/users')

    expect(onImportCurl).not.toHaveBeenCalled()
  })

  it('round-trips through the real curl parser', () => {
    const onImportCurl = vi.fn()
    render(<Harness onImportCurl={onImportCurl} />)
    const url = screen.getByLabelText('Request URL') as HTMLInputElement
    const command = 'curl https://api.example.com/users -H "Authorization: Bearer tok"'

    paste(url, command)

    const parsed = onImportCurl.mock.calls[0][0]
    expect(importCurl(parsed)?.headers).toEqual([
      { name: 'Authorization', value: 'Bearer tok', enabled: true }
    ])
  })
})
