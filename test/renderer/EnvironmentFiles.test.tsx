import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { EnvironmentsModal, type EnvCollectionRef } from '../../src/renderer/src/components/EnvironmentsModal'
import { serializeEnvironment } from '../../src/core/environment'

const SEP = '\u001f'

/** A disk-backed collection whose environment files live in `files`. */
function setup(envs: Array<{ name: string; file: string }>) {
  const files = new Map<string, string>()
  for (const e of envs) {
    files.set(`/c/environments/${e.file}`, serializeEnvironment({ name: e.name, variables: [{ name: 'host', value: e.name, enabled: true }] }))
  }
  const tiger = {
    readFile: vi.fn(async (p: string) => {
      const text = files.get(p)
      if (text === undefined) throw new Error(`ENOENT ${p}`)
      return text
    }),
    // Like Windows and macOS: one file whatever the case of its name.
    writeFile: vi.fn(async (p: string, content: string) => {
      const same = [...files.keys()].find((k) => k.toLowerCase() === p.toLowerCase())
      files.set(same ?? p, content)
      return true
    }),
    deleteFile: vi.fn(async (p: string) => {
      const same = [...files.keys()].find((k) => k.toLowerCase() === p.toLowerCase())
      if (same) files.delete(same)
      return true
    })
  }
  ;(window as { tiger?: unknown }).tiger = tiger

  function Harness() {
    const [col, setCol] = useState<EnvCollectionRef>({
      id: 'c',
      name: 'C',
      root: '/c',
      environments: envs.map((e) => ({ name: e.name, path: `/c/environments/${e.file}` }))
    })
    return (
      <EnvironmentsModal
        collections={[col]}
        initialColId="c"
        initialEnvName={envs[0]?.name}
        activeEnvKey={null}
        envKeySep={SEP}
        onActivate={() => {}}
        onCollectionsChanged={(_id, environments) => setCol((c) => ({ ...c, environments }))}
        onToast={() => {}}
        onClose={() => {}}
      />
    )
  }
  render(<Harness />)
  return { files, tiger }
}

afterEach(() => {
  delete (window as { tiger?: unknown }).tiger
})

describe('environment files', () => {
  it('renaming "staging" to "Staging" keeps the file (it was written, then deleted)', async () => {
    const { files } = setup([{ name: 'staging', file: 'staging.tiger' }])
    const name = (await screen.findByLabelText('Name')) as HTMLInputElement
    fireEvent.change(name, { target: { value: 'Staging' } })
    fireEvent.blur(name)
    await waitFor(() => expect([...files.values()].join('')).toContain('name: Staging'))
    expect(files.size).toBe(1)
    expect([...files.values()][0]).toContain('host: staging')
  })

  it('never gives a renamed environment the file of another one', async () => {
    const { files } = setup([
      { name: 'test', file: 'test.tiger' },
      { name: 'QA', file: 'qa.tiger' }
    ])
    const name = (await screen.findByLabelText('Name')) as HTMLInputElement
    fireEvent.change(name, { target: { value: 'Qa' } })
    fireEvent.blur(name)
    await waitFor(() => expect(files.size).toBe(2))
    await waitFor(() => expect(files.has('/c/environments/test.tiger')).toBe(false))
    expect(files.get('/c/environments/qa.tiger')).toContain('host: QA')
    expect([...files.entries()].find(([k]) => k !== '/c/environments/qa.tiger')?.[1]).toContain('name: Qa')
  })

  it('gives environments named in Chinese or Arabic their own files', async () => {
    const { files } = setup([{ name: '开发', file: '开发.tiger' }])
    const add = screen.getAllByRole('button', { name: /New environment/ })[0]
    fireEvent.click(add)
    await waitFor(() => expect(files.size).toBe(2))
    const name = (await screen.findByDisplayValue('new-environment')) as HTMLInputElement
    fireEvent.change(name, { target: { value: '测试' } })
    fireEvent.blur(name)
    await waitFor(() => expect([...files.keys()]).toContain('/c/environments/测试.tiger'))
    expect(files.get('/c/environments/开发.tiger')).toContain('name: 开发')
  })
})
