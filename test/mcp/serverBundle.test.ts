// @vitest-environment node
/**
 * The MCP server the app ships (out/mcp/server.mjs) is started by AI clients
 * from app.asar.unpacked, where no node_modules can be found. It must be one
 * self-contained file: build it exactly as `npm run build:mcp` does, then run
 * it with plain Node from an empty folder and talk MCP to it over stdio.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const OUTFILE = '--outfile=out/mcp/server.mjs'

let dir = ''
let bundle = ''
let metafile = ''

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'tiger-mcp-bundle-'))
  bundle = join(dir, 'server.mjs')
  metafile = join(dir, 'meta.json')
  const script: string = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).scripts['build:mcp']
  if (!script.includes(OUTFILE)) throw new Error(`build:mcp no longer writes ${OUTFILE}: update this test`)
  // As `npm run` would: through a shell, with node_modules/.bin on the PATH.
  const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH'
  execSync(script.replace(OUTFILE, `--outfile="${bundle}" --metafile="${metafile}"`), {
    cwd: repo,
    stdio: 'pipe',
    env: { ...process.env, [pathKey]: `${join(repo, 'node_modules', '.bin')}${delimiter}${process.env[pathKey] ?? ''}` }
  })
}, 60_000)

afterAll(() => rmSync(dir, { recursive: true, force: true }))

interface Reply {
  id?: number
  result?: Record<string, unknown>
  error?: { message: string }
}

/** Start `command args` in `cwd` and exchange newline-delimited JSON-RPC with it. */
function mcpSession(command: string, args: string[], cwd: string) {
  const child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
  const waiting = new Map<number, { resolve: (r: Reply) => void; reject: (e: Error) => void }>()
  let stdout = ''
  let stderr = ''
  child.stderr.on('data', (d: Buffer) => {
    stderr += d.toString()
  })
  child.stdout.on('data', (d: Buffer) => {
    stdout += d.toString()
    let nl: number
    while ((nl = stdout.indexOf('\n')) >= 0) {
      const line = stdout.slice(0, nl).trim()
      stdout = stdout.slice(nl + 1)
      if (!line) continue
      const reply = JSON.parse(line) as Reply
      if (reply.id !== undefined) waiting.get(reply.id)?.resolve(reply)
    }
  })
  child.on('exit', (code) => {
    for (const { reject } of waiting.values()) reject(new Error(`server exited (${code}): ${stderr}`))
  })
  const send = (message: Record<string, unknown>): void => {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
  }
  return {
    request(id: number, method: string, params: Record<string, unknown> = {}): Promise<Reply> {
      return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject })
        send({ id, method, params })
      })
    },
    notify: (method: string) => send({ method }),
    close: () => child.kill()
  }
}

describe('the bundled MCP server (npm run build:mcp)', () => {
  it('imports nothing but Node built-ins', () => {
    const meta = JSON.parse(readFileSync(metafile, 'utf8')) as {
      outputs: Record<string, { imports: Array<{ path: string; external?: boolean }> }>
    }
    const [output] = Object.entries(meta.outputs).filter(([path]) => path.endsWith('server.mjs'))
    const external = output[1].imports.filter((i) => i.external).map((i) => i.path)
    expect(external.filter((path) => !isBuiltin(path))).toEqual([])
  })

  it('starts with a #!node line, so npm can install it as the tiger-mcp command', () => {
    expect(readFileSync(bundle, 'utf8').startsWith('#!/usr/bin/env node\n')).toBe(true)
  })

  it('answers initialize, tools/list and a tool call with plain Node from an empty folder', async () => {
    const collection = join(dir, 'collection')
    mkdirSync(collection)
    writeFileSync(join(collection, 'ping.tiger'), 'meta {\n  name: Ping\n}\nget {\n  url: https://api.test/ping\n}\n')
    const empty = join(dir, 'empty')
    mkdirSync(empty)

    const server = mcpSession(process.execPath, [bundle, collection], empty)
    try {
      const init = await server.request(1, 'initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'tiger-test', version: '0' }
      })
      expect(init.result?.serverInfo).toMatchObject({ name: 'tiger' })
      server.notify('notifications/initialized')

      const tools = await server.request(2, 'tools/list')
      const names = (tools.result?.tools as Array<{ name: string }>).map((t) => t.name)
      expect(names.sort()).toEqual(['get_request', 'list_environments', 'list_requests', 'run_request'])

      const listed = await server.request(3, 'tools/call', { name: 'list_requests', arguments: {} })
      const content = listed.result?.content as Array<{ text: string }>
      expect(JSON.parse(content[0].text)).toEqual([{ name: 'Ping', path: 'ping.tiger' }])
    } finally {
      server.close()
    }
  }, 30_000)
})
