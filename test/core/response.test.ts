import { describe, expect, it } from 'vitest'
import { byteLength, formatResponse, humanSize, responseFileName } from '../../src/core/response'

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

describe('binary bodies', () => {
  const ff = Buffer.alloc(1000, 0xff)

  it('reports the size the transport measured in bytes, not the length of the text', () => {
    const out = formatResponse({
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/octet-stream' },
      // What the bytes look like as UTF-8 text: 1000 replacement characters.
      body: ff.toString('utf8'),
      bodyBase64: ff.toString('base64'),
      size: 1000,
      timeMs: 1
    })
    expect(out.size).toBe(1000)
    expect(out.sizeLabel).toBe('1000 B')
    expect(out.bodyBase64).toBe(ff.toString('base64'))
  })

  it('still measures the text when the transport gives no size (browser preview, MCP)', () => {
    const out = formatResponse({ status: 200, statusText: 'OK', headers: {}, body: 'é', timeMs: 1 })
    expect(out.size).toBe(2)
    expect(out.bodyBase64).toBeUndefined()
  })
})

describe('responseFileName', () => {
  const named = (headers: Record<string, string>, body = 'x') =>
    responseFileName(formatResponse({ status: 200, statusText: 'OK', headers, body, timeMs: 1 }))

  it.each([
    [{ 'content-type': 'application/json' }, '{"a":1}', 'response.json'],
    [{ 'content-type': 'application/vnd.api+json' }, '{"a":1}', 'response.json'],
    [{ 'content-type': 'application/pdf' }, '%PDF', 'response.pdf'],
    [{ 'content-type': 'image/png' }, 'x', 'response.png'],
    [{ 'content-type': 'image/svg+xml' }, '<svg/>', 'response.svg'],
    [{ 'content-type': 'text/html; charset=utf-8' }, '<p>', 'response.html'],
    [{ 'content-type': 'application/soap+xml' }, '<a/>', 'response.xml'],
    [{ 'content-type': 'text/csv' }, 'a,b', 'response.csv'],
    [{ 'content-type': 'application/zip' }, 'PK', 'response.zip'],
    [{ 'content-type': 'application/octet-stream' }, 'x', 'response.bin'],
    [{ 'content-type': 'text/plain' }, 'x', 'response.txt'],
    [{}, 'x', 'response.txt']
  ])('%j names the file after its type', (headers, body, name) => {
    expect(named(headers, body)).toBe(name)
  })

  it('takes the name the server gives in Content-Disposition, without any folder part', () => {
    expect(named({ 'Content-Disposition': 'attachment; filename="invoice 42.pdf"' })).toBe('invoice 42.pdf')
    expect(named({ 'content-disposition': "attachment; filename*=UTF-8''na%C3%AFve%20r%C3%A9sum%C3%A9.pdf" })).toBe(
      'naïve résumé.pdf'
    )
    expect(named({ 'content-disposition': 'attachment; filename=../../etc/passwd' })).toBe('passwd')
    expect(named({ 'content-disposition': 'inline' })).toBe('response.txt')
  })
})
