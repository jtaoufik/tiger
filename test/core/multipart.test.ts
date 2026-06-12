import { describe, expect, it } from 'vitest'
import {
  FILE_PREFIX,
  assembleMultipart,
  generateBoundary,
  parseMultipartContent
} from '../../src/core/multipart'
import { buildRequest } from '../../src/core/request'
import { parseRequest, serializeRequest } from '../../src/core/tigerFormat'
import { toCurl } from '../../src/core/codegen'
import type { TigerRequest } from '../../src/core/types'

describe('parseMultipartContent', () => {
  it('parses text rows, file rows and disabled rows', () => {
    const rows = parseMultipartContent(
      'name: Ada\navatar: @file:/tmp/cat.png\n~debug: 1\n# comment'
    )
    expect(rows).toEqual([
      { name: 'name', value: 'Ada', enabled: true, isFile: false },
      { name: 'avatar', value: '/tmp/cat.png', enabled: true, isFile: true },
      { name: 'debug', value: '1', enabled: false, isFile: false }
    ])
  })
})

describe('assembleMultipart', () => {
  it('produces RFC 2046 form-data with CRLF separators and the boundary header', () => {
    const { bytes, contentType } = assembleMultipart(
      [
        { name: 'a', value: 'one' },
        { name: 'f', value: new Uint8Array([1, 2, 3]), fileName: 'x.bin' }
      ],
      'BOUND'
    )
    expect(contentType).toBe('multipart/form-data; boundary=BOUND')
    const text = new TextDecoder().decode(bytes)
    expect(text).toContain('--BOUND\r\nContent-Disposition: form-data; name="a"\r\n\r\none\r\n')
    expect(text).toContain(
      'Content-Disposition: form-data; name="f"; filename="x.bin"\r\nContent-Type: application/octet-stream\r\n\r\n'
    )
    expect(text.endsWith('--BOUND--\r\n')).toBe(true)
    // binary survives byte-for-byte
    const idx = text.indexOf('octet-stream\r\n\r\n') + 'octet-stream\r\n\r\n'.length
    expect([...bytes.slice(idx, idx + 3)]).toEqual([1, 2, 3])
  })

  it('generates unique boundaries with the Tiger prefix', () => {
    const a = generateBoundary()
    const b = generateBoundary()
    expect(a).toMatch(/^----TigerFormBoundary[0-9a-f]{24}$/)
    expect(a).not.toBe(b)
  })
})

describe('multipart through buildRequest and the .tiger format', () => {
  const req: TigerRequest = {
    name: 'Upload',
    method: 'post',
    url: '{{base}}/upload',
    query: [],
    headers: [],
    body: {
      type: 'multipart',
      content: 'label: {{tag}}\nphoto: @file:{{dir}}/cat.png\n~off: x'
    }
  }

  it('builds interpolated multipart parts and no string body', () => {
    const built = buildRequest(req, { base: 'https://api.test', tag: 'pets', dir: '/tmp' })
    expect(built.body).toBeUndefined()
    expect(built.multipart).toEqual([
      { name: 'label', value: 'pets', isFile: false },
      { name: 'photo', value: '/tmp/cat.png', isFile: true }
    ])
    // Content-Type is set at send time together with the boundary.
    expect(Object.keys(built.headers).map((h) => h.toLowerCase())).not.toContain('content-type')
  })

  it('round-trips body:multipart through serialize + parse', () => {
    const out = serializeRequest(req)
    expect(out).toContain('body:multipart {')
    const back = parseRequest(out)
    expect(back.body.type).toBe('multipart')
    expect(back.body.content).toBe(req.body.content)
    expect(back).toEqual(req)
  })

  it('renders curl -F flags for multipart requests', () => {
    const built = buildRequest(req, { base: 'https://api.test', tag: 'pets', dir: '/tmp' })
    const curl = toCurl(built)
    expect(curl).toContain("-F 'label=pets'")
    expect(curl).toContain("-F 'photo=@/tmp/cat.png'")
    expect(curl).not.toContain('--data')
  })

  it(`exposes the ${FILE_PREFIX} prefix constant used by the editor`, () => {
    expect(FILE_PREFIX).toBe('@file:')
  })
})
