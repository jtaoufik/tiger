/**
 * WebSocket and Server-Sent Events requests in the real app: a loopback
 * echo server and event stream, a disk collection holding one request of
 * each kind, and the timeline showing what came back.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import { WebSocketServer } from 'ws'
import { expect, MOD, openCollection, openRequest, rm, test, useEnvironment } from './fixtures'
import { writeCollection } from './loopback'

interface Realtime {
  port: number
  upgrades: IncomingMessage['headers'][]
  close: () => Promise<void>
}

/** Echo every WebSocket text message as "echo: <text>"; /events streams two events. */
async function startRealtime(): Promise<Realtime> {
  const upgrades: IncomingMessage['headers'][] = []
  const streams: ServerResponse[] = []
  const wss = new WebSocketServer({ noServer: true })
  wss.on('connection', (socket) => {
    socket.on('message', (data) => socket.send(`echo: ${data.toString()}`))
  })
  const server: Server = createServer((req, res) => {
    if (req.url?.startsWith('/events')) {
      streams.push(res)
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
      res.write('event: greeting\ndata: hello from the stream\n\n')
      res.write('data: {"n": 2}\n\n')
      return
    }
    res.writeHead(404)
    res.end()
  })
  server.on('upgrade', (req, socket, head) => {
    upgrades.push(req.headers)
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return {
    port: (server.address() as AddressInfo).port,
    upgrades,
    close: () =>
      new Promise<void>((r) => {
        for (const s of streams) s.destroy()
        for (const c of wss.clients) c.terminate()
        wss.close()
        server.closeAllConnections()
        server.close(() => r())
      })
  }
}

const rt = test.extend<{ live: Realtime; dir: string }>({
  // eslint-disable-next-line no-empty-pattern
  live: async ({}, use) => {
    const live = await startRealtime()
    await use(live)
    await live.close()
  },
  dir: async ({ live }, use) => {
    const dir = writeCollection({
      'environments/dev.tiger': `meta {\n  name: dev\n}\n\nvars {\n  host: 127.0.0.1:${live.port}\n  who: Ada\n}\n`,
      'echo.tiger': [
        'meta {\n  name: Echo socket\n}',
        'ws {\n  url: ws://{{host}}/chat\n}',
        'headers {\n  X-Who: {{who}}\n}',
        'message:text:Greeting {\n  hello {{who}}\n}',
        ''
      ].join('\n\n'),
      'events.tiger': ['meta {\n  name: Event feed\n}', 'sse {\n  url: http://{{host}}/events\n}', ''].join('\n\n')
    })
    await use(dir)
    rm(resolve(dir, '..'))
  }
})

rt('connect a WebSocket to a local echo server and see the echoed message', async ({ tiger, live, dir }) => {
  const { page } = tiger
  await openCollection(tiger, dir)
  await useEnvironment(page, 'dev')
  await openRequest(page, 'WS', 'Echo socket')

  const timeline = page.getByRole('log', { name: 'Timeline' })
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Connection status' })).toHaveText('Connected')
  expect(live.upgrades[0]['x-who']).toBe('Ada')

  // Type in the composer and send with the keyboard (the registry's Send).
  const composer = page.getByRole('textbox', { name: 'Message to send' })
  await composer.fill('ping from e2e')
  await composer.press(`${MOD}+Enter`)
  await expect(timeline.getByRole('listitem').filter({ hasText: 'echo: ping from e2e' })).toBeVisible()
  await expect(timeline.getByRole('listitem').filter({ hasText: /Sent.*ping from e2e/ })).toBeVisible()

  // A saved message goes out with one click, its variables filled in.
  await page.getByRole('tab', { name: 'Saved messages, 1' }).click()
  await page.getByRole('button', { name: 'Send "Greeting"' }).click()
  await expect(timeline.getByRole('listitem').filter({ hasText: 'echo: hello Ada' })).toBeVisible()

  // Search narrows the timeline.
  await page.getByRole('searchbox', { name: 'Search messages' }).fill('greeting-that-is-not-there')
  await expect(page.getByText('No message matches the filter.')).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search messages' }).fill('')

  // The connect shortcut closes it again.
  await page.keyboard.press(`${MOD}+Shift+Enter`)
  await expect(page.getByRole('status', { name: 'Connection status' })).toHaveText('Disconnected')
  await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeVisible()
  expect(tiger.errors).toEqual([])
})

rt('listen to a local Server-Sent Events stream', async ({ tiger, dir }) => {
  const { page } = tiger
  await openCollection(tiger, dir)
  await useEnvironment(page, 'dev')
  await openRequest(page, 'SSE', 'Event feed')

  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  const timeline = page.getByRole('log', { name: 'Timeline' })
  await expect(timeline.getByRole('listitem').filter({ hasText: 'hello from the stream' })).toContainText('Event: greeting')
  await expect(timeline.getByRole('listitem').filter({ hasText: '{"n": 2}' })).toBeVisible()
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Connection status' })).toHaveText('Disconnected')
  expect(tiger.errors).toEqual([])
})
