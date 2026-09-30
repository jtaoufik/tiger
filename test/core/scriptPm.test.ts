import { describe, expect, it } from 'vitest'
import { applyHeaderChanges, runScript, type ScriptResponse } from '../../src/core/script'
import { findUnsupportedScriptApis } from '../../src/core/scriptCompat'
import { runCollection } from '../../src/core/runner'
import { executeJob } from '../../src/core/scriptProtocol'
import type { TigerRequest } from '../../src/core/types'

const response: ScriptResponse = {
  status: 201,
  headers: [
    { name: 'Content-Type', value: 'application/json; charset=utf-8' },
    { name: 'X-Rate-Remaining', value: '99' }
  ],
  body: '{"id":7,"name":"Ada","tags":["a","b"],"nested":{"ok":true}}',
  timeMs: 42
}
const post = (source: string, vars: Record<string, string> = {}) => runScript(source, { vars, response })
const pre = (source: string, vars: Record<string, string> = {}) =>
  runScript(source, {
    vars,
    request: {
      name: 'Create user',
      method: 'post',
      url: 'https://api.test/users?dry=1',
      headers: [
        { name: 'Accept', value: 'application/json', enabled: true },
        { name: 'X-Off', value: '1', enabled: false }
      ],
      body: '{"a":1}'
    }
  })

describe('pm.test and pm.expect', () => {
  it('records a passing and a failing test with a chai-like message', () => {
    const r = post(`
      pm.test('ok', () => pm.expect(1).to.equal(1))
      pm.test('bad', () => pm.expect(404).to.equal(200))
    `)
    expect(r.tests).toEqual([
      { name: 'ok', passed: true },
      { name: 'bad', passed: false, error: 'expected 404 to equal 200' }
    ])
  })

  it('supports the common assertion vocabulary', () => {
    const r = post(`
      pm.test('all', () => {
        pm.expect({ a: 1 }).to.eql({ a: 1 })
        pm.expect({ a: [1, 2] }).to.deep.equal({ a: [1, 2] })
        pm.expect('hello').to.be.a('string')
        pm.expect([1]).to.be.an('array').that.is.not.empty
        pm.expect('hello world').to.include('world')
        pm.expect([1, 2, 3]).to.include(2)
        pm.expect({ id: 1, x: 2 }).to.have.property('id', 1)
        pm.expect({ id: 1 }).to.have.property('id')
        pm.expect([1, 2]).to.have.lengthOf(2)
        pm.expect(5).to.be.above(2).and.below(10)
        pm.expect(5).to.be.at.least(5)
        pm.expect(5).to.be.at.most(5)
        pm.expect(5).to.be.within(1, 9)
        pm.expect('abc').to.match(/^a/)
        pm.expect(2).to.be.oneOf([1, 2])
        pm.expect(true).to.be.true
        pm.expect(false).to.be.false
        pm.expect(null).to.be.null
        pm.expect(undefined).to.be.undefined
        pm.expect(0).to.not.be.ok
        pm.expect('x').to.exist
        pm.expect({ a: 1, b: 2 }).to.have.keys('a', 'b')
        pm.expect([2, 1]).to.have.members([1, 2])
        pm.expect(1).to.not.equal(2)
      })
    `)
    expect(r.error).toBeUndefined()
    expect(r.tests).toEqual([{ name: 'all', passed: true }])
  })

  it('fails negated and custom-message assertions correctly', () => {
    const r = post(`
      pm.test('neg', () => pm.expect([]).to.not.be.empty)
      pm.test('msg', () => pm.expect(1, 'count').to.equal(2))
    `)
    expect(r.tests[0]).toMatchObject({ passed: false, error: 'expected [] not to be empty' })
    expect(r.tests[1]).toMatchObject({ passed: false, error: 'count: expected 1 to equal 2' })
  })
})

describe('pm.response', () => {
  it('exposes code, status, time, json(), text() and headers', () => {
    const r = post(`
      pm.environment.set('code', pm.response.code)
      pm.environment.set('status', pm.response.status)
      pm.environment.set('time', pm.response.responseTime)
      pm.environment.set('name', pm.response.json().name)
      pm.environment.set('len', pm.response.text().length)
      pm.environment.set('ct', pm.response.headers.get('content-type'))
      pm.environment.set('has', pm.response.headers.has('X-Rate-Remaining'))
    `)
    expect(r.vars).toEqual({
      code: '201',
      status: 'Created',
      time: '42',
      name: 'Ada',
      len: String(response.body.length),
      ct: 'application/json; charset=utf-8',
      has: 'true'
    })
  })

  it('supports pm.response.to.have.status / header / be.ok / be.json', () => {
    const r = post(`
      pm.test('status', () => pm.response.to.have.status(201))
      pm.test('status text', () => pm.response.to.have.status('Created'))
      pm.test('wrong status', () => pm.response.to.have.status(200))
      pm.test('header', () => pm.response.to.have.header('X-Rate-Remaining', '99'))
      pm.test('ok', () => pm.response.to.be.ok)
      pm.test('json', () => pm.response.to.be.json)
      pm.test('not error', () => pm.response.to.not.be.serverError)
      pm.test('json body path', () => pm.response.to.have.jsonBody('nested.ok'))
    `)
    expect(r.tests.map((t) => [t.name, t.passed])).toEqual([
      ['status', true],
      ['status text', true],
      ['wrong status', false],
      ['header', true],
      ['ok', true],
      ['json', true],
      ['not error', true],
      ['json body path', true]
    ])
    expect(r.tests[2].error).toBe('expected response to have status 200 but got 201')
  })

  it('throws a readable error when json() is called on a non-JSON body', () => {
    const r = runScript("pm.response.json()", {
      vars: {},
      response: { ...response, body: '<html>' }
    })
    expect(r.error).toBe('Response body is not valid JSON')
  })
})

describe('pm variable scopes', () => {
  it('maps environment, variables, collectionVariables and globals onto one map', () => {
    const r = post(
      `
      pm.environment.set('a', '1')
      pm.variables.set('b', 2)
      pm.collectionVariables.set('c', { x: 1 })
      pm.globals.set('d', true)
      pm.environment.set('fromEnv', pm.environment.get('seed'))
      pm.environment.set('hasSeed', pm.variables.has('seed'))
      pm.collectionVariables.unset('drop')
      pm.environment.set('replaced', pm.variables.replaceIn('{{seed}}-x'))
    `,
      { seed: 's', drop: 'x' }
    )
    expect(r.vars).toEqual({
      seed: 's',
      a: '1',
      b: '2',
      c: '{"x":1}',
      d: 'true',
      fromEnv: 's',
      hasSeed: 'true',
      replaced: 's-x'
    })
  })

  it('maps the legacy postman.* and tests[] sandbox', () => {
    const r = post(`
      postman.setEnvironmentVariable('id', JSON.parse(responseBody).id)
      postman.setGlobalVariable('g', postman.getEnvironmentVariable('id'))
      tests['created'] = responseCode.code === 201
      tests['fast'] = responseTime < 10
    `)
    expect(r.vars).toMatchObject({ id: '7', g: '7' })
    expect(r.tests).toEqual([
      { name: 'created', passed: true },
      { name: 'fast', passed: false, error: 'Assertion failed' }
    ])
  })
})

describe('pm.request and pm.info', () => {
  it('reads the request and collects header changes', () => {
    const r = pre(`
      pm.environment.set('m', pm.request.method)
      pm.environment.set('u', pm.request.url.toString())
      pm.environment.set('p', pm.request.url.getPath())
      pm.environment.set('accept', pm.request.headers.get('accept'))
      pm.environment.set('off', String(pm.request.headers.has('X-Off')))
      pm.environment.set('event', pm.info.eventName)
      pm.environment.set('name', pm.info.requestName)
      pm.request.headers.add({ key: 'X-Sig', value: 'abc' })
      pm.request.headers.upsert({ key: 'Accept', value: 'text/plain' })
      pm.request.headers.remove('X-Gone')
      pm.environment.set('accept2', pm.request.headers.get('Accept'))
    `)
    expect(r.error).toBeUndefined()
    expect(r.vars).toEqual({
      m: 'POST',
      u: 'https://api.test/users?dry=1',
      p: '/users',
      accept: 'application/json',
      off: 'false',
      event: 'prerequest',
      name: 'Create user',
      accept2: 'text/plain'
    })
    expect(r.headerChanges).toEqual([
      { name: 'X-Sig', value: 'abc' },
      { name: 'Accept', value: 'text/plain' },
      { name: 'X-Gone' }
    ])
  })

  it('applies header changes to a request header list', () => {
    const headers = [
      { name: 'accept', value: 'application/json', enabled: true },
      { name: 'X-Gone', value: '1', enabled: true }
    ]
    expect(
      applyHeaderChanges(headers, [
        { name: 'Accept', value: 'text/plain' },
        { name: 'x-gone' },
        { name: 'X-New', value: '1' }
      ])
    ).toEqual([
      { name: 'Accept', value: 'text/plain', enabled: true },
      { name: 'X-New', value: '1', enabled: true }
    ])
  })

  it('stubs unsupported calls with a clear message', () => {
    expect(post('pm.sendRequest("https://x", () => {})').error).toBe('pm.sendRequest is not supported in Tiger yet')
    expect(post('pm.cookies.get("a")').error).toBe('pm.cookies is not supported in Tiger yet')
    const skipped = post('pm.execution.setNextRequest("Next"); pm.visualizer.set("<b/>")')
    expect(skipped.error).toBeUndefined()
    expect(skipped.logs).toHaveLength(2)
  })
})

describe('Insomnia and Bruno aliases', () => {
  it('runs insomnia.* like pm.*', () => {
    const r = post(`insomnia.test('code', () => insomnia.expect(insomnia.response.code).to.equal(201))`)
    expect(r.tests).toEqual([{ name: 'code', passed: true }])
  })

  it('runs bru / res / req / test / expect', () => {
    const r = runScript(
      `
      bru.setEnvVar('id', res.body.id)
      bru.setVar('status', res.getStatus())
      bru.setVar('ct', res.getHeader('content-type'))
      bru.setVar('method', req.getMethod())
      req.setHeader('X-From', 'bruno')
      test('has name', function () { expect(res.getBody().name).to.equal('Ada') })
    `,
      {
        vars: {},
        response,
        request: { method: 'get', url: 'https://x', headers: [] }
      }
    )
    expect(r.error).toBeUndefined()
    expect(r.vars).toEqual({
      id: '7',
      status: '201',
      ct: 'application/json; charset=utf-8',
      method: 'GET'
    })
    expect(r.tests).toEqual([{ name: 'has name', passed: true }])
    expect(r.headerChanges).toEqual([{ name: 'X-From', value: 'bruno' }])
  })

  it('does not break a Tiger script that declares its own res / test / expect', () => {
    const r = post(`
      const res = tiger.response
      function test(n) { return n }
      let expect = 1
      tiger.setVar('s', res.status + test(1) + expect)
    `)
    expect(r.error).toBeUndefined()
    expect(r.vars.s).toBe('203')
  })

  it('keeps the tiger API unchanged', () => {
    const r = post(`tiger.test('t', () => tiger.expect(tiger.response.json.id === 7))`)
    expect(r.tests).toEqual([{ name: 't', passed: true }])
  })
})

describe('findUnsupportedScriptApis', () => {
  it('lists unsupported calls in plain language, ignoring comments', () => {
    expect(findUnsupportedScriptApis('pm.test("x", () => pm.expect(1).to.equal(1))')).toEqual([])
    expect(
      findUnsupportedScriptApis(`
        // pm.sendRequest(commented out)
        const sig = CryptoJS.HmacSHA256(body, key)
        pm.sendRequest(url, cb)
        const _ = require('lodash')
      `)
    ).toEqual([
      'pm.sendRequest (sending another request)',
      'require() of a library (lodash, moment, crypto-js, ...)',
      'CryptoJS'
    ])
    expect(findUnsupportedScriptApis('postman.setNextRequest("x")')).toEqual([
      'postman.setNextRequest (flow control is skipped)'
    ])
    expect(findUnsupportedScriptApis(undefined)).toEqual([])
  })
})

describe('runner applies pre-request header changes', () => {
  it('sends the headers a pre-request script added', async () => {
    const request: TigerRequest = {
      name: 'Signed',
      method: 'get',
      url: 'https://x',
      headers: [],
      query: [],
      body: { type: 'none', content: '' },
      preScript: "pm.request.headers.add({ key: 'X-Sig', value: pm.environment.get('k') })",
      postScript: 'pm.test("ok", () => pm.response.to.have.status(200))'
    }
    const seen: TigerRequest[] = []
    const summary = await runCollection([{ id: '1', name: 'Signed', request }], {
      vars: { k: 'secret' },
      execute: async (r) => {
        seen.push(r)
        return { status: 200, headers: [], body: '', timeMs: 1 }
      },
      // Same path as the desktop app: a plain-JSON job through the host protocol.
      runScript: (source, ctx) => executeJob(JSON.parse(JSON.stringify({ source, ...ctx })))
    })
    expect(seen[0].headers).toEqual([{ name: 'X-Sig', value: 'secret', enabled: true }])
    expect(summary.results[0].tests).toEqual([{ name: 'ok', passed: true }])
  })
})
