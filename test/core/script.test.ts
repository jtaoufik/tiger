import { describe, expect, it } from 'vitest'
import { runScript } from '../../src/core/script'

describe('runScript', () => {
  it('reads and sets variables', () => {
    const r = runScript('tiger.setVar("token", tiger.getVar("seed") + "-x")', {
      vars: { seed: 'abc' }
    })
    expect(r.vars.token).toBe('abc-x')
    expect(r.error).toBeUndefined()
  })

  it('exposes the response to post scripts (json parsed)', () => {
    const r = runScript('tiger.setVar("id", tiger.response.json.id)', {
      vars: {},
      response: { status: 200, headers: [], body: '{"id":42}', timeMs: 5 }
    })
    expect(r.vars.id).toBe('42')
  })

  it('records passing and failing tests', () => {
    const r = runScript(
      `tiger.test("ok status", () => tiger.expect(tiger.response.status === 200))
       tiger.test("has id", () => tiger.expect(tiger.response.json.id === 99, "wrong id"))`,
      { vars: {}, response: { status: 200, headers: [], body: '{"id":42}', timeMs: 1 } }
    )
    expect(r.tests).toEqual([
      { name: 'ok status', passed: true },
      { name: 'has id', passed: false, error: 'wrong id' }
    ])
  })

  it('captures a header value (case-insensitive lookup by the script)', () => {
    const r = runScript(
      `const h = tiger.response.headers.find(x => x.name.toLowerCase() === "x-token")
       tiger.setVar("t", h.value)`,
      { vars: {}, response: { status: 200, headers: [{ name: 'X-Token', value: 'zzz' }], body: '', timeMs: 1 } }
    )
    expect(r.vars.t).toBe('zzz')
  })

  it('collects console.log output', () => {
    const r = runScript('tiger.log("hello", 123)', { vars: {} })
    expect(r.logs).toEqual(['hello 123'])
  })

  it('captures a thrown error without crashing', () => {
    const r = runScript('throw new Error("boom")', { vars: {} })
    expect(r.error).toBe('boom')
  })

  it('does not leak Node/DOM globals into the sandbox', () => {
    const r = runScript('tiger.setVar("p", typeof process)', { vars: {} })
    expect(r.vars.p).toBe('undefined')
  })

  it('no-ops on an empty script', () => {
    expect(runScript('   ', { vars: { a: '1' } })).toEqual({ vars: { a: '1' }, logs: [], tests: [] })
  })
})

describe('runScript with scripts written for Postman and Bruno (sloppy mode)', () => {
  const response = { status: 200, headers: [], body: '{"token":"abc"}', timeMs: 1 }

  it('runs a script that assigns a variable it never declared', () => {
    const r = runScript('data = JSON.parse(responseBody);\npm.environment.set("token", data.token);', {
      vars: {},
      response
    })
    expect(r.error).toBeUndefined()
    expect(r.vars.token).toBe('abc')
  })

  it('lets a script declare names Tiger provides or hides, like module and document', () => {
    const r = runScript(
      `const module = 'users'
       const document = { id: 7 }
       let fetch = '!'
       const require = (x) => x + '?'
       class window {}
       const console = { log() {} }
       const pm = { tag: 'own' }
       tiger.setVar('m', module + document.id + fetch + require('r') + typeof window + pm.tag)`,
      { vars: {} }
    )
    expect(r.error).toBeUndefined()
    expect(r.vars.m).toBe('users7!r?functionown')
  })

  it('does not let a variable created by one script show up in the next', () => {
    const first = runScript('leakedToken = "secret"\nthis.alsoLeaked = 1\ntiger.setVar("t", leakedToken)', {
      vars: {}
    })
    expect(first.vars.t).toBe('secret')
    expect((globalThis as Record<string, unknown>).leakedToken).toBeUndefined()
    expect((globalThis as Record<string, unknown>).alsoLeaked).toBeUndefined()

    const next = runScript('tiger.setVar("seen", typeof leakedToken)', { vars: {} })
    expect(next.vars.seen).toBe('undefined')
  })

  it('reports a script that tries to close the wrapper as a syntax error, without running it', () => {
    const r = runScript('}; tiger.setVar("escaped", "1"); (function () {', { vars: {} })
    expect(r.error).toBeTruthy()
    expect(r.vars.escaped).toBeUndefined()
  })
})
