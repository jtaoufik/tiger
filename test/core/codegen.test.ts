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
    expect(curl).toContain("--data '{\"name\":\"Ada\"}'")
  })

  it('escapes single quotes safely', () => {
    expect(toCurl(built)).toContain("Bearer it'\\''s-a-secret")
  })

  it('omits --data when there is no body', () => {
    expect(toCurl({ method: 'GET', url: 'https://api.test', headers: {} })).not.toContain('--data')
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
