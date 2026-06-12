import { describe, expect, it } from 'vitest'
import { runCollection, type RunnerItem } from '../../src/core/runner'
import type { TigerRequest } from '../../src/core/types'

function req(partial: Partial<TigerRequest>): TigerRequest {
  return {
    name: 'r',
    method: 'get',
    url: 'https://api.test/x',
    query: [],
    headers: [],
    body: { type: 'none', content: '' },
    ...partial
  }
}

const okResponse = (body = '{}') => ({
  status: 200,
  headers: [{ name: 'content-type', value: 'application/json' }],
  body,
  timeMs: 5
})

describe('runCollection', () => {
  it('runs items sequentially and reports pass for non-error statuses', async () => {
    const order: string[] = []
    const items: RunnerItem[] = [
      { id: 'a', name: 'A', request: req({}) },
      { id: 'b', name: 'B', request: req({}) }
    ]
    const summary = await runCollection(items, {
      vars: {},
      execute: async (r) => {
        order.push(r.name)
        return okResponse()
      }
    })
    expect(order).toEqual(['r', 'r'])
    expect(summary.passed).toBe(2)
    expect(summary.failed).toBe(0)
    expect(summary.results.map((r) => r.status)).toEqual([200, 200])
  })

  it('fails a request on 4xx/5xx status', async () => {
    const summary = await runCollection([{ id: 'a', name: 'A', request: req({}) }], {
      vars: {},
      execute: async () => ({ ...okResponse(), status: 500 })
    })
    expect(summary.failed).toBe(1)
    expect(summary.results[0].passed).toBe(false)
  })

  it('judges pass/fail from post-response script tests', async () => {
    const items: RunnerItem[] = [
      {
        id: 'a',
        name: 'asserts ok',
        request: req({
          postScript: 'tiger.test("is 200", () => tiger.expect(tiger.response.status === 200))'
        })
      },
      {
        id: 'b',
        name: 'asserts wrong',
        request: req({
          postScript: 'tiger.test("is teapot", () => tiger.expect(tiger.response.status === 418))'
        })
      }
    ]
    const summary = await runCollection(items, { vars: {}, execute: async () => okResponse() })
    expect(summary.results[0].passed).toBe(true)
    expect(summary.results[1].passed).toBe(false)
    expect(summary.results[1].tests[0]).toMatchObject({ name: 'is teapot', passed: false })
  })

  it('threads captures into the variables of later requests', async () => {
    const seenVars: Array<Record<string, string>> = []
    const items: RunnerItem[] = [
      {
        id: 'login',
        name: 'Login',
        request: req({ captures: [{ name: 'token', value: 'body.access', enabled: true }] })
      },
      { id: 'me', name: 'Me', request: req({}) }
    ]
    const summary = await runCollection(items, {
      vars: { base: 'x' },
      execute: async (_r, vars) => {
        seenVars.push({ ...vars })
        return okResponse('{"access":"tok-123"}')
      }
    })
    expect(seenVars[0]).toEqual({ base: 'x' })
    expect(seenVars[1]).toEqual({ base: 'x', token: 'tok-123' })
    expect(summary.vars.token).toBe('tok-123')
  })

  it('lets pre-request scripts set variables for the same request', async () => {
    let got: Record<string, string> = {}
    await runCollection(
      [
        {
          id: 'a',
          name: 'A',
          request: req({ preScript: 'tiger.setVar("nonce", "n-1")' })
        }
      ],
      {
        vars: {},
        execute: async (_r, vars) => {
          got = { ...vars }
          return okResponse()
        }
      }
    )
    expect(got.nonce).toBe('n-1')
  })

  it('records transport errors and keeps going', async () => {
    const items: RunnerItem[] = [
      { id: 'a', name: 'A', request: req({}) },
      { id: 'b', name: 'B', request: req({}) }
    ]
    let n = 0
    const summary = await runCollection(items, {
      vars: {},
      execute: async () => {
        n++
        if (n === 1) throw new Error('ECONNREFUSED')
        return okResponse()
      }
    })
    expect(summary.results[0]).toMatchObject({ passed: false, error: 'ECONNREFUSED' })
    expect(summary.results[1].passed).toBe(true)
  })

  it('stops between requests when shouldStop returns true', async () => {
    let count = 0
    const items: RunnerItem[] = ['a', 'b', 'c'].map((id) => ({ id, name: id, request: req({}) }))
    const summary = await runCollection(items, {
      vars: {},
      execute: async () => {
        count++
        return okResponse()
      },
      shouldStop: () => count >= 1
    })
    expect(count).toBe(1)
    expect(summary.stopped).toBe(true)
    expect(summary.results).toHaveLength(1)
  })

  it('fires onResult after each request with index and total', async () => {
    const ticks: Array<[string, number, number]> = []
    await runCollection(
      ['a', 'b'].map((id) => ({ id, name: id.toUpperCase(), request: req({}) })),
      {
        vars: {},
        execute: async () => okResponse(),
        onResult: (r, i, total) => ticks.push([r.name, i, total])
      }
    )
    expect(ticks).toEqual([
      ['A', 0, 2],
      ['B', 1, 2]
    ])
  })
})
