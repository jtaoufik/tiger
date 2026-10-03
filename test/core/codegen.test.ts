import { describe, expect, it } from 'vitest'
import { generateCode, toCurl, toFetch } from '../../src/core/codegen'
import type { BuiltRequest } from '../../src/core/request'

const built: BuiltRequest = {
  method: 'POST',
  url: 'https://api.test/users',
  headers: { 'Content-Type': 'application/json', Authorization: "Bearer it's-a-secret" },
  body: '{"name":"Ada"}'
}

describe('toCurl', () => {
  it('includes method, url, headers and body', () => {
    const curl = toCurl(built)
    expect(curl).toContain('curl -X POST')
    expect(curl).toContain("'https://api.test/users'")
    expect(curl).toContain("-H 'Content-Type: application/json'")
    expect(curl).toContain("--data-raw '{\"name\":\"Ada\"}'")
  })

  it('escapes single quotes safely', () => {
    expect(toCurl(built)).toContain("Bearer it'\\''s-a-secret")
  })

  it('omits --data-raw when there is no body', () => {
    expect(toCurl({ method: 'GET', url: 'https://api.test', headers: {} })).not.toContain('--data')
  })
})

const upload: BuiltRequest = {
  method: 'POST',
  url: 'https://api.test/upload',
  headers: { Authorization: 'Bearer t' },
  multipart: [
    { name: 'caption', value: 'holiday', isFile: false },
    { name: 'note', value: '@not-a-file', isFile: false },
    { name: 'photo', value: '/tmp/pics/cat.png', isFile: true }
  ]
}

describe('curl never reads a local file the request did not ask for', () => {
  it('sends the body with --data-raw, so a body starting with @ stays text', () => {
    const curl = toCurl({ ...built, body: '@/etc/passwd' })
    expect(curl).toContain("--data-raw '@/etc/passwd'")
    expect(curl).not.toMatch(/--data '/)
  })

  it('sends form text fields with --form-string and only file rows with -F name=@path', () => {
    const curl = toCurl(upload)
    expect(curl).toContain("--form-string 'caption=holiday'")
    expect(curl).toContain("--form-string 'note=@not-a-file'")
    expect(curl).toContain("-F 'photo=@/tmp/pics/cat.png'")
    expect(curl).not.toContain("-F 'caption")
  })
})

describe('toFetch', () => {
  it('produces a fetch call with method and body', () => {
    const code = toFetch(built)
    expect(code).toContain('await fetch("https://api.test/users"')
    expect(code).toContain('"method": "POST"')
  })
})

describe('generateCode', () => {
  it('dispatches by target', () => {
    expect(generateCode(built, 'curl').startsWith('curl')).toBe(true)
    expect(generateCode(built, 'fetch').startsWith('await fetch')).toBe(true)
  })
})
