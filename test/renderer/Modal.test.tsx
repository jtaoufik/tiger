import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Modal } from '../../src/renderer/src/components/Modal'
import { ConfirmModal } from '../../src/renderer/src/components/ConfirmModal'
import { PromptModal } from '../../src/renderer/src/components/PromptModal'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div data-testid="background">
        <button onClick={() => setOpen(true)}>Open settings</button>
      </div>
      {open && (
        <Modal
          title="Edit thing"
          description="Change the name below."
          onClose={() => setOpen(false)}
          footer={
            <>
              <button onClick={() => setOpen(false)}>Cancel</button>
              <button>Save</button>
            </>
          }
        >
          <label htmlFor="n">Name</label>
          <input id="n" />
        </Modal>
      )}
    </>
  )
}

describe('Modal', () => {
  it('is a labelled, described modal dialog that focuses the first field', () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open settings' })
    opener.focus()
    fireEvent.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Edit thing' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription('Change the name below.')
    expect(screen.getByLabelText('Name')).toHaveFocus()
  })

  it('traps Tab and Shift+Tab inside the dialog', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    const close = screen.getByRole('button', { name: 'Close' })
    const save = screen.getByRole('button', { name: 'Save' })
    save.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(close).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(save).toHaveFocus()
  })

  it('makes the background inert while open and restores it after', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    expect(screen.getByTestId('background')).toHaveAttribute('inert')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByTestId('background')).not.toHaveAttribute('inert')
  })

  it('closes on Esc and returns focus to the element that opened it', () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open settings' })
    opener.focus()
    fireEvent.click(opener)
    expect(opener).not.toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('only closes the topmost dialog on Esc', () => {
    const outer = vi.fn()
    const inner = vi.fn()
    render(
      <Modal title="Outer" onClose={outer}>
        <input aria-label="outer field" />
        <Modal title="Inner" onClose={inner}>
          <input aria-label="inner field" />
        </Modal>
      </Modal>
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(inner).toHaveBeenCalledTimes(1)
    expect(outer).not.toHaveBeenCalled()
  })
})

describe('ConfirmModal', () => {
  it('is an alertdialog with the message as description and Cancel focused', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmModal
        title="Delete request?"
        message="This removes the file from disk."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    )
    const dialog = screen.getByRole('alertdialog', { name: 'Delete request?' })
    expect(dialog).toHaveAccessibleDescription('This removes the file from disk.')
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    const del = screen.getByRole('button', { name: 'Delete' })
    expect(del).toHaveClass('danger')
    // Cancel sits left of the destructive action.
    expect(
      screen.getByRole('button', { name: 'Cancel' }).compareDocumentPosition(del) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })
})

describe('PromptModal', () => {
  it('labels its field, marks it required and reports an empty submit', () => {
    const onSubmit = vi.fn()
    render(
      <PromptModal title="New collection" label="Collection name" onSubmit={onSubmit} onCancel={() => {}} />
    )
    const input = screen.getByRole('textbox', { name: /Collection name/ })
    expect(input).toHaveFocus()
    expect(input).toBeRequired()
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Collection name is required.')
    fireEvent.change(input, { target: { value: 'Payments' } })
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(onSubmit).toHaveBeenCalledWith('Payments')
  })
})
