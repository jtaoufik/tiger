import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { KeyValue } from '../../src/core/types'
import { KeyValueEditor } from '../../src/renderer/src/components/KeyValueEditor'

function Harness({ initial }: { initial: KeyValue[] }) {
  const [items, setItems] = useState(initial)
  return (
    <KeyValueEditor
      items={items}
      placeholder={['Header', 'Value']}
      onChange={setItems}
    />
  )
}

const three: KeyValue[] = [
  { name: 'Accept', value: 'application/json', enabled: true },
  { name: 'X-Trace', value: 'abc', enabled: false },
  { name: 'Authorization', value: 'Bearer t', enabled: true }
]

describe('KeyValueEditor', () => {
  it('labels every cell by row', () => {
    render(<Harness initial={three} />)
    expect(screen.getByRole('textbox', { name: 'Header 3 name' })).toHaveValue('Authorization')
    expect(screen.getByRole('textbox', { name: 'Header 3 value' })).toHaveValue('Bearer t')
    expect(screen.getByRole('checkbox', { name: 'Enable header 2' })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Remove header 1 (Accept)' })).toBeInTheDocument()
    // The trailing blank row is the "new" row.
    expect(screen.getByRole('textbox', { name: 'New header name' })).toHaveValue('')
  })

  it('moves focus to the new row key field when adding', () => {
    render(<Harness initial={three} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add header' }))
    expect(screen.getByRole('textbox', { name: 'New header name' })).toHaveFocus()
  })

  it('Enter in a value jumps to the next row key', () => {
    render(<Harness initial={three} />)
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Header 1 value' }), { key: 'Enter' })
    expect(screen.getByRole('textbox', { name: 'Header 2 name' })).toHaveFocus()
  })

  it('keeps focus in place after removing a row', () => {
    render(<Harness initial={three} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove header 2 (X-Trace)' }))
    const slot = screen.getByRole('textbox', { name: 'Header 2 name' })
    expect(slot).toHaveValue('Authorization')
    expect(slot).toHaveFocus()
  })
})
