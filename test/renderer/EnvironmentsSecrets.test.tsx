import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { EnvironmentsModal, type EnvCollectionRef } from '../../src/renderer/src/components/EnvironmentsModal'
import type { TigerEnvironment } from '../../src/core/types'

const SEP = '\u001f'

/** An in-memory collection (no files) so edits land straight in the harness state. */
function setup(env: TigerEnvironment) {
  function Harness() {
    const [col, setCol] = useState<EnvCollectionRef>({
      id: 'c',
      name: 'C',
      environments: [{ name: env.name, data: env }]
    })
    return (
      <EnvironmentsModal
        collections={[col]}
        initialColId="c"
        initialEnvName={env.name}
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
}

afterEach(() => {
  delete (window as { tiger?: unknown }).tiger
})

describe('environment secrets', () => {
  it('a secret below a revealed row stays hidden when that row is removed', async () => {
    setup({
      name: 'dev',
      variables: [
        { name: 'apiKey', value: 'key-1', enabled: true, secret: true },
        { name: 'token', value: 'tok-2', enabled: true, secret: true }
      ]
    })
    const value = (n: number) => screen.getByLabelText(`Variable ${n} value (secret)`) as HTMLInputElement
    expect(value(1).type).toBe('password')
    expect(value(2).type).toBe('password')

    fireEvent.click(screen.getByRole('button', { name: 'Reveal variable 1 value' }))
    expect(value(1).type).toBe('text')
    expect(value(2).type).toBe('password')

    // Row 2 slides into slot 1; the reveal must not slide with the slot.
    fireEvent.click(screen.getByRole('button', { name: /^Remove variable 1\b/ }))
    expect(value(1).value).toBe('tok-2')
    expect(value(1).type).toBe('password')
  })

  it('a revealed row keeps its reveal when a row above it is removed', () => {
    setup({
      name: 'dev',
      variables: [
        { name: 'host', value: 'h', enabled: true },
        { name: 'token', value: 'tok-2', enabled: true, secret: true }
      ]
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reveal variable 2 value' }))
    expect((screen.getByLabelText('Variable 2 value (secret)') as HTMLInputElement).type).toBe('text')
    fireEvent.click(screen.getByRole('button', { name: /^Remove variable 1\b/ }))
    const moved = screen.getByLabelText('Variable 1 value (secret)') as HTMLInputElement
    expect(moved.value).toBe('tok-2')
    expect(moved.type).toBe('text')
  })
})
