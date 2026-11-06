import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { rateLimitedAnnouncer } from '../../src/renderer/src/a11y'
import { RealtimeTimeline } from '../../src/renderer/src/components/RealtimeTimeline'
import { RealtimeEditor } from '../../src/renderer/src/components/RealtimeEditor'
import { receiveRealtimeEvents, forgetRealtime } from '../../src/renderer/src/realtime'
import type { RealtimeEvent } from '../../src/core/realtime'
import type { TigerRequest } from '../../src/core/types'

describe('rateLimitedAnnouncer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('reads the first message at once, then sums up a burst once per interval', () => {
    const said: string[] = []
    const a = rateLimitedAnnouncer({ intervalMs: 1000, summarize: (n) => `${n} more`, announce: (m) => said.push(m) })
    a.push('one')
    a.push('two')
    a.push('three')
    a.push('four')
    expect(said).toEqual(['one'])
    vi.advanceTimersByTime(1000)
    expect(said).toEqual(['one', '3 more'])
    a.push('five')
    expect(said).toEqual(['one', '3 more'])
    vi.advanceTimersByTime(1000)
    expect(said).toEqual(['one', '3 more', 'five'])
    vi.advanceTimersByTime(5000)
    a.push('six')
    expect(said.at(-1)).toBe('six')
    a.dispose()
  })
})

const ID = 'col::chat.tiger'
const at = 1_700_000_000_000

/** An event as main sends it, minus the id and time the helper adds. */
type EventInput = RealtimeEvent extends infer E ? (E extends RealtimeEvent ? Omit<E, 'id' | 'at'> : never) : never

function feed(events: EventInput[]): void {
  act(() => receiveRealtimeEvents(events.map((e, i) => ({ ...e, at: at + i, id: ID }) as RealtimeEvent)))
}

describe('RealtimeTimeline', () => {
  afterEach(() => act(() => forgetRealtime(ID)))

  it('is a log region that lists sent and received messages with size, and filters them', () => {
    render(<RealtimeTimeline id={ID} />)
    expect(screen.getByText('Nothing yet. Connect to see messages here.')).toBeInTheDocument()
    feed([
      { type: 'connecting', url: 'ws://127.0.0.1/x', attempt: 0 },
      { type: 'open' },
      { type: 'sent', data: 'hello', size: 5 },
      { type: 'message', data: 'echo: hello', size: 11 }
    ])
    const log = screen.getByRole('log', { name: 'Timeline' })
    // The list does not announce by itself; the rate-limited announcer does.
    expect(log).toHaveAttribute('aria-live', 'off')
    const items = within(log).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Connecting to ws://127.0.0.1/x'),
      expect.stringContaining('Connected'),
      expect.stringMatching(/Sent.*hello.*5 B/),
      expect.stringMatching(/Received.*echo: hello.*11 B/)
    ])
    expect(screen.getByRole('status', { name: 'Connection status' })).toHaveTextContent('Connected')
    expect(screen.getByText('2 messages')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Received' }))
    expect(within(screen.getByRole('log')).getAllByRole('listitem')).toHaveLength(1)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search messages' }), { target: { value: 'nothing' } })
    expect(screen.getByText('No message matches the filter.')).toBeInTheDocument()
  })

  it('announces received messages politely, rate limited', () => {
    vi.useFakeTimers()
    try {
      render(<RealtimeTimeline id={ID} />)
      const polite = () => document.getElementById('tiger-live-polite')?.textContent?.trim()
      feed([{ type: 'message', data: 'first', size: 5 }])
      expect(polite()).toBe('Received: first')
      feed([
        { type: 'message', data: 'second', size: 6 },
        { type: 'message', data: 'third', size: 5 }
      ])
      expect(polite()).toBe('Received: first')
      act(() => vi.advanceTimersByTime(1500))
      expect(polite()).toBe('2 more messages received')
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears with the registry action', () => {
    render(<RealtimeTimeline id={ID} />)
    feed([{ type: 'message', data: 'x', size: 1 }])
    fireEvent.click(screen.getByRole('button', { name: 'Clear the timeline' }))
    expect(screen.queryByRole('log')).toBeNull()
  })
})

describe('RealtimeEditor', () => {
  const ws: TigerRequest = {
    kind: 'ws',
    name: 'Chat',
    method: 'get',
    url: 'ws://127.0.0.1:1/x',
    query: [],
    headers: [],
    body: { type: 'none', content: '' },
    subprotocols: [],
    messages: []
  }

  function Harness(props: { onSend?: (text: string) => void; onToggle?: () => void; initial?: TigerRequest }) {
    const [req, setReq] = useState<TigerRequest>(props.initial ?? ws)
    return (
      <RealtimeEditor
        id={ID}
        request={req}
        diskBacked={false}
        dirty={false}
        missingVars={[]}
        onChange={setReq}
        onSave={() => undefined}
        onToggleConnection={props.onToggle ?? (() => undefined)}
        onSendMessage={props.onSend ?? (() => undefined)}
      />
    )
  }

  afterEach(() => act(() => forgetRealtime(ID)))

  it('prettifies JSON, saves the message and sends a saved one with one click once connected', () => {
    const sent: string[] = []
    const toggle = vi.fn()
    render(<Harness onSend={(t) => sent.push(t)} onToggle={toggle} />)
    fireEvent.click(screen.getByRole('button', { name: /Connect/ }))
    expect(toggle).toHaveBeenCalledOnce()

    const box = screen.getByRole('textbox', { name: 'Message to send' })
    fireEvent.change(box, { target: { value: '{"a":1}' } })
    fireEvent.click(screen.getByRole('button', { name: 'JSON' }))
    fireEvent.click(screen.getByRole('button', { name: 'Prettify' }))
    expect(box).toHaveValue('{\n  "a": 1\n}')

    // Not connected yet: Send says so instead of sending.
    fireEvent.click(screen.getByRole('button', { name: /^Send$/ }))
    expect(sent).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Save message' }))
    expect(screen.getByRole('tab', { name: 'Saved messages, 1' })).toBeInTheDocument()

    feed([{ type: 'open' }])
    expect(screen.getByRole('button', { name: /Disconnect/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Saved messages, 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send "Message 1"' }))
    expect(sent).toEqual(['{\n  "a": 1\n}'])
  })

  it('shows the reconnect toggle for SSE and no message sections', () => {
    render(<Harness initial={{ ...ws, kind: 'sse', subprotocols: undefined, messages: undefined, reconnect: false }} />)
    expect(screen.queryByRole('tab', { name: 'Message' })).toBeNull()
    const box = screen.getByRole('checkbox', { name: 'Reconnect automatically' })
    fireEvent.click(box)
    expect(box).toBeChecked()
  })
})
