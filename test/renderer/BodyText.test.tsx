import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BodyText, CHUNK_CHARS, chunkText } from '../../src/renderer/src/components/BodyText'
import { ResponsePanel } from '../../src/renderer/src/components/ResponsePanel'
import { findMatches } from '../../src/core/textSearch'
import { formatResponse } from '../../src/core/response'

/** Reassemble chunks the way the DOM shows them: one line box per block. */
const rejoin = (text: string) =>
  chunkText(text, 50)
    .map((c) => text.slice(c.start, c.end))
    .join('\n')

describe('chunkText', () => {
  it('cuts only at line breaks and loses nothing but a final newline', () => {
    const samples = [
      '',
      'one line',
      'a\nb\nc',
      '\n\nleading blank lines',
      'trailing\n',
      'crlf\r\nlines\r\nhere',
      Array.from({ length: 400 }, (_, i) => `line ${i}`).join('\n'),
      'x'.repeat(500) + '\n' + 'y'.repeat(10),
      Array.from({ length: 100 }, (_, i) => (i % 7 === 0 ? '' : `row ${i}`)).join('\n')
    ]
    for (const text of samples) {
      const back = rejoin(text)
      expect(back === text || back + '\n' === text).toBe(true)
    }
  })

  it('keeps chunks near the target size, a single long line whole', () => {
    const text = Array.from({ length: 5000 }, (_, i) => `"key${i}": ${i},`).join('\n')
    const chunks = chunkText(text)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks.slice(0, -1)) {
      expect(c.end - c.start).toBeGreaterThanOrEqual(CHUNK_CHARS)
      expect(c.end - c.start).toBeLessThan(CHUNK_CHARS + 40)
      expect(text[c.end]).toBe('\n')
    }
    expect(chunkText('z'.repeat(CHUNK_CHARS * 3))).toHaveLength(1)
  })

  it('counts lines per chunk', () => {
    expect(chunkText('a\nb\nc')).toEqual([{ start: 0, end: 5, lines: 3 }])
  })
})

describe('BodyText', () => {
  const big = Array.from({ length: 4000 }, (_, i) => `  "item": ${i},`).join('\n')

  it('renders a large body as several blocks with the same text', () => {
    const { container } = render(
      <BodyText text={big} highlight={false} ranges={null} activeMatch={0} />
    )
    const blocks = container.querySelectorAll('.resp-chunk')
    expect(blocks.length).toBeGreaterThan(1)
    expect([...blocks].map((b) => b.textContent).join('\n')).toBe(big)
  })

  it('marks every match across blocks and exactly one active match', () => {
    const { ranges } = findMatches(big, '"item": 39', { limit: 500 })
    const { container } = render(
      <BodyText text={big} highlight={false} ranges={ranges} activeMatch={5} />
    )
    const marks = container.querySelectorAll('mark.hit')
    expect(marks).toHaveLength(ranges.length)
    const active = container.querySelectorAll('mark.hit.active')
    expect(active).toHaveLength(1)
    expect(marks[5]).toBe(active[0])
  })
})

describe('ResponsePanel with a large pretty-printed body', () => {
  it('still finds and cycles matches spread over many blocks', () => {
    const items = Array.from({ length: 1200 }, (_, i) => ({ id: i, name: `Item ${i}` }))
    const data = formatResponse({
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(items),
      timeMs: 5
    })
    const { container } = render(<ResponsePanel state={{ loading: false, data }} />)
    expect(container.querySelectorAll('.resp-chunk').length).toBeGreaterThan(1)
    fireEvent.click(screen.getByRole('button', { name: 'Search in response' }))
    const input = container.querySelector<HTMLInputElement>('.resp-search input')!
    fireEvent.change(input, { target: { value: 'Item 29' } })
    // "Item 29" and "Item 290".."Item 299".
    expect(container.querySelectorAll('mark.hit')).toHaveLength(1 + 10)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(container.querySelector('mark.hit.active')?.textContent).toBe('Item 29')
    expect(container.querySelectorAll('mark.hit')[1]).toHaveClass('active')
  }, 20_000) // heavy DOM test; timed out at 5 s under high machine load
})
