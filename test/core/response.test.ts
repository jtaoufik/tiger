import { describe, expect, it } from 'vitest'
import { byteLength, formatResponse, humanSize } from '../../src/core/response'

describe('humanSize', () => {
  it('formats bytes, KB and MB', () => {
    expect(humanSize(512)).toBe('512 B')
    expect(humanSize(2048)).toBe('2 KB')
    expect(humanSize(1536)).toBe('1.5 KB')
    expect(humanSize(5 * 1024 * 1024)).toBe('5 MB')
  })
})

describe('byteLength', () => {
  it('counts UTF-8 bytes, not characters', () => {
    expect(byteLength('é')).toBe(2)
    expect(byteLength('🐯')).toBe(4)
  })
})

describe('formatResponse', () => {
  const base = {
    status: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'application/json' },
    timeMs: 42
  }

  it('pretty-prints a JSON body and flags isJson', () => {
    const out = formatResponse({ ...base, body: '{"a":1,"b":2}' })
    expect(out.isJson).toBe(true)
    expect(out.body).toBe('{\n  "a": 1,\n  "b": 2\n}')
  })

  it('leaves a non-JSON body untouched', () => {
    const out = formatResponse({ ...base, headers: {}, body: 'plain text' })
    expect(out.isJson).toBe(false)
    expect(out.body).toBe('plain text')
  })

  it('marks 2xx as ok and others as not ok', () => {
    expect(formatResponse({ ...base, body: '{}' }).ok).toBe(true)
    expect(formatResponse({ ...base, status: 404, body: '{}' }).ok).toBe(false)
  })

  it('computes size and a friendly label', () => {
    const out = formatResponse({ ...base, body: 'x'.repeat(2048) })
    expect(out.size).toBe(2048)
    expect(out.sizeLabel).toBe('2 KB')
  })

  it('exposes headers as an ordered list', () => {
    const out = formatResponse({ ...base, body: '{}' })
    expect(out.headers).toContainEqual({ name: 'Content-Type', value: 'application/json' })
  })

  it('handles an empty body', () => {
    const out = formatResponse({ ...base, status: 204, statusText: 'No Content', headers: {}, body: '' })
    expect(out.size).toBe(0)
    expect(out.isJson).toBe(false)
  })
})

describe('formatResponse timings + large bodies', () => {
  it('passes through phase timings', () => {
    const r = formatResponse({
      status: 200, statusText: 'OK', headers: {}, body: '{}', timeMs: 120,
      timings: { total: 120, waiting: 90, download: 30 }
    })
    expect(r.timings).toEqual({ total: 120, waiting: 90, download: 30 })
  })

  it('skips pretty-printing past the size limit and flags it', () => {
    const big = '[' + '1,'.repeat(1_100_000) + '1]' // > PRETTY_LIMIT chars
    const r = formatResponse({
      status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' },
      body: big, timeMs: 5
    })
    expect(r.tooLargeToPretty).toBe(true)
    expect(r.body).toBe(big) // unchanged, not re-stringified
    expect(r.isJson).toBe(true) // inferred from content-type
  })

  it('pretty-prints normal JSON and marks it not-too-large', () => {
    const r = formatResponse({
      status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' },
      body: '{"a":1}', timeMs: 5
    })
    expect(r.tooLargeToPretty).toBe(false)
    expect(r.body).toBe('{\n  "a": 1\n}')
  })
})
