import { describe, expect, it, vi } from 'vitest'
import {
  SCRIPT_LIMITS,
  clampTimeout,
  createScriptHostQueue,
  executeJob,
  sanitizeResult,
  validateJob,
  type ScriptHost
} from '../../src/core/scriptProtocol'

/** A host that runs jobs in-process, like the real one does in its sandbox. */
function inProcessHost(): ScriptHost & { killed: boolean; runs: number } {
  const h = {
    killed: false,
    runs: 0,
    run: async (job: unknown) => {
      h.runs++
      // Round-trip through JSON: the real bridge only carries plain data.
      return JSON.parse(JSON.stringify(executeJob(JSON.parse(JSON.stringify(job)))))
    },
    kill: () => {
      h.killed = true
    }
  }
  return h
}

/** A host stuck in a synchronous infinite loop: never replies until killed. */
function hungHost(): ScriptHost & { killed: boolean } {
  const h = {
    killed: false,
    run: () => new Promise<unknown>(() => {}),
    kill: () => {
      h.killed = true
    }
  }
  return h
}

describe('validateJob', () => {
  it('keeps only known fields and stringifies vars', () => {
    const job = validateJob({
      source: 'x',
      vars: { a: 1, b: null },
      evil: 'drop me',
      response: {
        status: '201',
        body: 'b',
        headers: [{ name: 'h', value: 2 }, 'junk'],
        timeMs: 3,
        json: {}
      }
    })
    expect(job).toEqual({
      source: 'x',
      vars: { a: '1', b: '' },
      response: {
        status: 201,
        body: 'b',
        headers: [{ name: 'h', value: '2' }],
        timeMs: 3
      }
    })
  })

  it('rejects bad shapes and oversized sources', () => {
    expect(() => validateJob(null)).toThrow()
    expect(() => validateJob({ source: 42, vars: {} })).toThrow(/source/)
    expect(() => validateJob({ source: 'x', vars: [] })).toThrow(/vars/)
    expect(() =>
      validateJob({
        source: 'x'.repeat(SCRIPT_LIMITS.maxSourceChars + 1),
        vars: {}
      })
    ).toThrow(/too long/)
  })

  it('clamps the timeout', () => {
    expect(clampTimeout(undefined)).toBe(SCRIPT_LIMITS.defaultTimeoutMs)
    expect(clampTimeout(1)).toBe(SCRIPT_LIMITS.minTimeoutMs)
    expect(clampTimeout(10 ** 9)).toBe(SCRIPT_LIMITS.maxTimeoutMs)
  })
})

describe('executeJob (host side)', () => {
  it('returns env mutations', () => {
    const r = executeJob({
      source: 'tiger.setVar("token", tiger.getVar("seed") + "-x")',
      vars: { seed: 's' }
    })
    expect(r).toEqual({
      vars: { seed: 's', token: 's-x' },
      logs: [],
      tests: []
    })
  })

  it('returns test results with the response json re-derived from the body', () => {
    const r = executeJob({
      source: `
        tiger.test("status is 200", () => tiger.expect(tiger.response.status === 200))
        tiger.test("id", () => tiger.expect(tiger.response.json.id === 7, "wrong id"))
        tiger.test("fails", () => tiger.expect(false, "nope"))
        tiger.log("done", { n: 1 })
      `,
      vars: {},
      response: { status: 200, headers: [], body: '{"id":7}', timeMs: 1 }
    })
    expect(r.tests).toEqual([
      { name: 'status is 200', passed: true },
      { name: 'id', passed: true },
      { name: 'fails', passed: false, error: 'nope' }
    ])
    expect(r.logs).toEqual(['done {"n":1}'])
    expect(r.error).toBeUndefined()
  })

  it('reports a thrown error and keeps the vars set before it', () => {
    const r = executeJob({
      source: 'tiger.setVar("a", "1"); throw new Error("boom")',
      vars: {}
    })
    expect(r.error).toBe('boom')
    expect(r.vars).toEqual({ a: '1' })
  })

  it('reports a syntax error', () => {
    const r = executeJob({ source: 'this is not js', vars: { k: 'v' } })
    expect(r.error).toBeTruthy()
    expect(r.vars).toEqual({ k: 'v' })
  })

  it('reports an invalid job instead of throwing', () => {
    expect(executeJob({ vars: {} }).error).toMatch(/source/)
  })

  it('caps output size', () => {
    const r = executeJob({
      source: `for (let i = 0; i < ${SCRIPT_LIMITS.maxLogs + 50}; i++) tiger.log("x".repeat(${SCRIPT_LIMITS.maxLogChars + 10}))`,
      vars: {}
    })
    expect(r.logs).toHaveLength(SCRIPT_LIMITS.maxLogs + 1)
    expect(r.logs[0]).toMatch(/truncated 10 chars/)
    expect(r.logs.at(-1)).toMatch(/50 more log lines dropped/)
  })
})

describe('sanitizeResult (main side)', () => {
  it('turns anything into a strings-only result', () => {
    const r = sanitizeResult({
      vars: { a: 1, ['__proto__']: 'p' },
      logs: [1, { x: 1 }],
      tests: [{ name: 5, passed: 'yes' }, 'junk', { name: 'ok', passed: true, error: null }],
      error: 12
    })
    expect(r.vars.a).toBe('1')
    expect(Object.getPrototypeOf(r.vars)).toBe(Object.prototype)
    expect(Object.keys(r.vars)).toContain('__proto__')
    expect(r.logs).toEqual(['1', '[object Object]'])
    expect(r.tests).toEqual([
      { name: '5', passed: false },
      { name: 'ok', passed: true }
    ])
    expect(r.error).toBe('12')
  })

  it('falls back to the input vars when the host returns garbage', () => {
    expect(sanitizeResult('nope', { a: '1' })).toEqual({
      vars: { a: '1' },
      logs: [],
      tests: [],
      error: 'Script host returned no result'
    })
  })
})

describe('createScriptHostQueue', () => {
  it('runs jobs in one host and returns env mutations and tests', async () => {
    const host = inProcessHost()
    const spawn = vi.fn(() => host)
    const q = createScriptHostQueue(spawn)
    const pre = await q.run({ source: 'tiger.setVar("n", "1")', vars: {} })
    const post = await q.run({
      source: 'tiger.test("t", () => tiger.expect(tiger.getVar("n") === "1"))',
      vars: pre.vars,
      response: { status: 200, headers: [], body: '', timeMs: 0 }
    })
    expect(pre.vars).toEqual({ n: '1' })
    expect(post.tests).toEqual([{ name: 't', passed: true }])
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(host.runs).toBe(2)
  })

  it('skips the host for empty scripts', async () => {
    const spawn = vi.fn(inProcessHost)
    const r = await createScriptHostQueue(spawn).run({
      source: '  ',
      vars: { a: '1' }
    })
    expect(r).toEqual({ vars: { a: '1' }, logs: [], tests: [] })
    expect(spawn).not.toHaveBeenCalled()
  })

  it('kills a hung host on timeout and spawns a fresh one for the next job', async () => {
    const hung = hungHost()
    const fresh = inProcessHost()
    const spawn = vi.fn<() => ScriptHost>().mockReturnValueOnce(hung).mockReturnValueOnce(fresh)
    const q = createScriptHostQueue(spawn)

    const started = Date.now()
    const r = await q.run({
      source: 'while (true) {}',
      vars: { keep: 'me' },
      timeoutMs: 60
    })
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(r).toEqual({
      vars: { keep: 'me' },
      logs: [],
      tests: [],
      error: 'Script timed out after 60 ms'
    })
    expect(hung.killed).toBe(true)

    const next = await q.run({ source: 'tiger.setVar("ok", "yes")', vars: {} })
    expect(next.vars).toEqual({ ok: 'yes' })
    expect(spawn).toHaveBeenCalledTimes(2)
  })

  it('serialises jobs: a job waits for the one before it', async () => {
    const order: string[] = []
    const host: ScriptHost = {
      run: async (job) => {
        const src = (job as { source: string }).source
        order.push(`start ${src}`)
        await new Promise((r) => setTimeout(r, src === 'slow' ? 30 : 1))
        order.push(`end ${src}`)
        return { vars: {}, logs: [], tests: [] }
      },
      kill: () => {}
    }
    const q = createScriptHostQueue(() => host)
    await Promise.all([q.run({ source: 'slow', vars: {} }), q.run({ source: 'fast', vars: {} })])
    expect(order).toEqual(['start slow', 'end slow', 'start fast', 'end fast'])
  })

  it('turns a host crash into a script error and respawns', async () => {
    const crashing: ScriptHost = {
      run: async () => Promise.reject(new Error('gone')),
      kill: vi.fn()
    }
    const spawn = vi.fn<() => ScriptHost>().mockReturnValueOnce(crashing).mockReturnValueOnce(inProcessHost())
    const q = createScriptHostQueue(spawn)
    const r = await q.run({ source: 'x', vars: {} })
    expect(r.error).toBe('Script sandbox error: gone')
    expect(crashing.kill).toHaveBeenCalled()
    expect((await q.run({ source: 'tiger.setVar("a", 1)', vars: {} })).vars).toEqual({ a: '1' })
  })

  it('reports an invalid job without spawning', async () => {
    const spawn = vi.fn(inProcessHost)
    const r = await createScriptHostQueue(spawn).run({
      source: 1,
      vars: { a: 'b' }
    })
    expect(r.error).toMatch(/source/)
    expect(r.vars).toEqual({ a: 'b' })
    expect(spawn).not.toHaveBeenCalled()
  })

  it('bounds what a hostile host returns', async () => {
    const q = createScriptHostQueue(() => ({
      run: async () => ({
        vars: { x: 'y'.repeat(SCRIPT_LIMITS.maxValueChars + 5) },
        logs: [],
        tests: []
      }),
      kill: () => {}
    }))
    const r = await q.run({ source: 'x', vars: {} })
    expect(r.vars.x).toMatch(/truncated 5 chars/)
  })
})
