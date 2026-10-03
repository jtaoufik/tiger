import { describe, expect, it } from 'vitest'
import { generateCode, toCurl, toFetch, toPython } from '../../src/core/codegen'
import type { BuiltRequest } from '../../src/core/request'

const built: BuiltRequest = {
  method: 'POST',
  url: 'https://api.test/users',
  headers: { 'Content-Type': 'application/json', Authorization: "Bearer it's-a-secret" },
  body: '{"name":"Ada"}'
}

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

describe('Code tab: multipart bodies', () => {
  it('the fetch snippet builds a FormData with every field and file', () => {
    const code = toFetch({ ...upload, headers: { ...upload.headers, 'Content-Type': 'multipart/form-data' } })
    expect(code).toContain("import { readFile } from 'node:fs/promises'")
    expect(code).toContain('const form = new FormData()')
    expect(code).toContain('form.append("caption", "holiday")')
    expect(code).toContain('form.append("note", "@not-a-file")')
    expect(code).toContain('form.append("photo", new Blob([await readFile("/tmp/pics/cat.png")]), "cat.png")')
    expect(code).toContain('"body": form')
    // fetch writes the multipart Content-Type (with its boundary) itself.
    expect(code).not.toContain('multipart/form-data')
    expect(code).toContain('"Authorization": "Bearer t"')
  })

  it('a fetch snippet with text fields only needs no file import', () => {
    const code = toFetch({ ...upload, multipart: upload.multipart!.slice(0, 1) })
    expect(code).not.toContain('readFile')
    expect(code).toContain('form.append("caption", "holiday")')
  })

  it('the Python snippet sends every field as multipart with files=', () => {
    const code = toPython({ ...upload, headers: { ...upload.headers, 'content-type': 'multipart/form-data' } })
    expect(code).toContain('("caption", (None, "holiday"))')
    expect(code).toContain('("note", (None, "@not-a-file"))')
    expect(code).toContain('("photo", ("cat.png", open("/tmp/pics/cat.png", "rb")))')
    expect(code).toContain('response = requests.post("https://api.test/upload", headers=headers, files=files)')
    // requests writes the multipart Content-Type (with its boundary) itself.
    expect(code).not.toContain('multipart/form-data')
  })

  it('a Windows file path keeps its base name', () => {
    const code = toPython({ ...upload, multipart: [{ name: 'doc', value: 'C:\\Users\\ada\\report.pdf', isFile: true }] })
    expect(code).toContain('("doc", ("report.pdf", open("C:\\\\Users\\\\ada\\\\report.pdf", "rb")))')
  })
})

describe('generateCode', () => {
  it('dispatches by target', () => {
    expect(generateCode(built, 'curl').startsWith('curl')).toBe(true)
    expect(generateCode(built, 'fetch').startsWith('await fetch')).toBe(true)
  })
})
