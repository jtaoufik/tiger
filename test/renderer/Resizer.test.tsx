import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { Resizer, RESIZE_STEP, RESIZE_STEP_LARGE } from '../../src/renderer/src/components/Resizer'

function Host({ direction = 'col' as 'col' | 'row', start = 264 }) {
  const [size, setSize] = useState(start)
  return (
    <Resizer
      direction={direction}
      label="Resize sidebar"
      value={size}
      min={200}
      max={440}
      onDrag={() => {}}
      onResize={setSize}
      controls="pane"
    />
  )
}

const sep = () => screen.getByRole('separator', { name: 'Resize sidebar' })

describe('Resizer keyboard', () => {
  it('is a focusable, labelled window splitter with value bounds', () => {
    render(<Host />)
    expect(sep()).toHaveAttribute('tabindex', '0')
    expect(sep()).toHaveAttribute('aria-orientation', 'vertical')
    expect(sep()).toHaveAttribute('aria-valuenow', '264')
    expect(sep()).toHaveAttribute('aria-valuemin', '200')
    expect(sep()).toHaveAttribute('aria-valuemax', '440')
    expect(sep()).toHaveAttribute('aria-controls', 'pane')
  })

  it('Left/Right resize a vertical splitter; Shift is coarse', () => {
    render(<Host />)
    fireEvent.keyDown(sep(), { key: 'ArrowRight' })
    expect(sep()).toHaveAttribute('aria-valuenow', String(264 + RESIZE_STEP))
    fireEvent.keyDown(sep(), { key: 'ArrowLeft', shiftKey: true })
    expect(sep()).toHaveAttribute('aria-valuenow', String(264 + RESIZE_STEP - RESIZE_STEP_LARGE))
    // Up/Down do nothing on a vertical splitter.
    fireEvent.keyDown(sep(), { key: 'ArrowUp' })
    expect(sep()).toHaveAttribute('aria-valuenow', String(264 + RESIZE_STEP - RESIZE_STEP_LARGE))
  })

  it('clamps to min/max and Home/End jump to the bounds', () => {
    render(<Host start={430} />)
    fireEvent.keyDown(sep(), { key: 'ArrowRight' })
    expect(sep()).toHaveAttribute('aria-valuenow', '440')
    fireEvent.keyDown(sep(), { key: 'Home' })
    expect(sep()).toHaveAttribute('aria-valuenow', '200')
    fireEvent.keyDown(sep(), { key: 'ArrowLeft' })
    expect(sep()).toHaveAttribute('aria-valuenow', '200')
    fireEvent.keyDown(sep(), { key: 'End' })
    expect(sep()).toHaveAttribute('aria-valuenow', '440')
  })

  it('Up/Down resize a horizontal splitter', () => {
    render(<Host direction="row" start={300} />)
    expect(sep()).toHaveAttribute('aria-orientation', 'horizontal')
    fireEvent.keyDown(sep(), { key: 'ArrowDown' })
    expect(sep()).toHaveAttribute('aria-valuenow', String(300 + RESIZE_STEP))
    fireEvent.keyDown(sep(), { key: 'ArrowUp' })
    fireEvent.keyDown(sep(), { key: 'ArrowUp' })
    expect(sep()).toHaveAttribute('aria-valuenow', String(300 - RESIZE_STEP))
  })

  it('stays pointer-only (not focusable) without a keyboard handler', () => {
    render(<Resizer direction="col" onDrag={() => {}} />)
    expect(screen.getByRole('separator')).not.toHaveAttribute('tabindex')
  })
})
