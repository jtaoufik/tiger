import { describe, expect, it } from 'vitest'
import { decodeText, normalizeText } from '../../src/core/text'
import { parseEnvironment } from '../../src/core/environment'
import { parseRequest, serializeRequest } from '../../src/core/tigerFormat'
import { buildRequest } from '../../src/core/request'

const crlf = (s: string) => s.replace(/\n/g, '\r\n')

describe('text as Windows tools save it', () => {
  it('decodes UTF-8 with a BOM and UTF-16 (PowerShell >) to the same text', () => {
    const text = 'meta {\n  name: dev\n}\n'
    const utf8Bom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)])
    const le = new Uint8Array(2 + text.length * 2)
    le.set([0xff, 0xfe])
    const be = new Uint8Array(2 + text.length * 2)
    be.set([0xfe, 0xff])
    for (let i = 0; i < text.length; i++) {
      le[2 + i * 2] = text.charCodeAt(i)
      be[3 + i * 2] = text.charCodeAt(i)
    }
    expect(decodeText(utf8Bom)).toBe(text)
    expect(decodeText(le)).toBe(text)
    expect(decodeText(be)).toBe(text)
    expect(parseEnvironment(decodeText(le)).name).toBe('dev')
  })

  it('normalizes CRLF and a leading BOM', () => {
    expect(normalizeText('﻿a\r\nb\rc\n')).toBe('a\nb\nc\n')
  })
})

describe('a .tiger file checked out with CRLF (Git for Windows)', () => {
  const lf = [
    'meta {',
    '  name: SOAP call',
    '}',
    '',
    'post {',
    '  url: https://soap.test/ws',
    '}',
    '',
    'body:xml {',
    '  <?xml version="1.0"?>',
    '  <Envelope/>',
    '}',
    '',
    'script:pre {',
    "  tiger.setVar('a', '1')",
    "  console.log('x')",
    '}',
    ''
  ].join('\n')

  it('reads exactly like the LF file, so the XML body starts with its declaration', () => {
    const fromCrlf = parseRequest(crlf(lf))
    expect(fromCrlf).toEqual(parseRequest(lf))
    expect(buildRequest(fromCrlf, {}).body?.startsWith('<?xml')).toBe(true)
  })

  it('saves an unchanged request without adding a line each time', () => {
    let text = crlf(lf)
    for (let i = 0; i < 3; i++) text = crlf(serializeRequest(parseRequest(text)))
    expect(text.replace(/\r\n/g, '\n')).toBe(serializeRequest(parseRequest(lf)))
  })
})
