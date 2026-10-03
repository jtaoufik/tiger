import { describe, expect, it } from 'vitest'
import { generateCode, toCurl, toCurlCmd, toFetch, toPython } from '../../src/core/codegen'
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

describe('curl for Windows cmd.exe', () => {
  it('uses curl.exe, ^" quoting and ^ line continuations', () => {
    expect(toCurlCmd(built)).toBe(
      [
        'curl.exe -X POST ^"https://api.test/users^"',
        '-H ^"Content-Type: application/json^"',
        `-H ^"Authorization: Bearer it's-a-secret^"`,
        '--data-raw ^"^{^\\^"name^\\^":^\\^"Ada^\\^"^}^"'
      ].join(' ^\n  ')
    )
  })

  it('escapes what cmd.exe would act on: & | < > ^ and %VAR%', () => {
    const code = toCurlCmd({ method: 'GET', url: 'https://api.test/s?a=1&b=<2>|3^4&q=a%20b%PATH%', headers: {} })
    expect(code).toBe('curl.exe -X GET ^"https://api.test/s?a=1^&b=^<2^>^|3^^4^&q=a^%^20b^%^PATH^%^"')
  })

  it('doubles backslashes only where the C runtime needs it: before a quote', () => {
    const code = toCurlCmd({
      method: 'POST',
      url: 'https://api.test/up',
      headers: { 'X-Dir': 'C:\\dir\\', 'X-Q': 'a\\"b' },
      multipart: [{ name: 'f', value: 'C:\\pics\\cat.png', isFile: true }]
    })
    // C:\dir\ -> "C:\dir\\" for the runtime; a\"b -> "a\\\"b".
    expect(code).toContain('-H ^"X-Dir: C:^\\dir^\\^\\^"')
    expect(code).toContain('-H ^"X-Q: a^\\^\\^\\^"b^"')
    expect(code).toContain('-F ^"f=^@C:^\\pics^\\cat.png^"')
  })

  it('keeps the line breaks of a body (a caret, then two newlines)', () => {
    expect(toCurlCmd({ method: 'POST', url: 'https://a.test', headers: {}, body: 'one\ntwo' })).toContain(
      '--data-raw ^"one^\n\ntwo^"'
    )
  })

  it('sends form text fields literally there too', () => {
    expect(toCurlCmd(upload)).toContain('--form-string ^"note=^@not-a-file^"')
  })

  /**
   * What cmd.exe does to a typed command line: %VAR% expands when VAR is
   * defined, then outside quotes ^ makes the next character literal (^ before
   * a line break joins the next line) and & | < > would end the command.
   */
  function cmdReads(line: string, env: Record<string, string>): string {
    let expanded = ''
    for (let i = 0; i < line.length; i++) {
      const end = line[i] === '%' ? line.indexOf('%', i + 1) : -1
      const name = end === -1 ? '' : line.slice(i + 1, end)
      if (name && name in env) {
        expanded += env[name]
        i = end
      } else {
        expanded += line[i]
      }
    }
    let out = ''
    let quoted = false
    for (let i = 0; i < expanded.length; i++) {
      const c = expanded[i]
      if (c === '"') quoted = !quoted
      if (!quoted && c === '^') {
        if (expanded[i + 1] === '\n') i++
        if (i + 1 < expanded.length) out += expanded[++i]
        continue
      }
      if (!quoted && /[&|<>]/.test(c)) throw new Error(`cmd.exe would act on "${c}"`)
      out += c
    }
    return out
  }

  /** How the C runtime splits a Windows command line into argv (backslash and quote rules). */
  function runtimeArgs(line: string): string[] {
    const args: string[] = []
    let cur: string | null = null
    let quoted = false
    let i = 0
    while (i < line.length) {
      let slashes = 0
      while (line[i] === '\\') {
        slashes++
        i++
      }
      if (line[i] === '"') {
        cur = (cur ?? '') + '\\'.repeat(slashes >> 1)
        if (slashes % 2) cur += '"'
        else quoted = !quoted
        i++
        continue
      }
      if (slashes) cur = (cur ?? '') + '\\'.repeat(slashes)
      if (i >= line.length) break
      const c = line[i++]
      if (!quoted && (c === ' ' || c === '\t')) {
        if (cur !== null) args.push(cur)
        cur = null
      } else {
        cur = (cur ?? '') + c
      }
    }
    if (cur !== null) args.push(cur)
    return args
  }

  it.each([
    '{"name":"Ada & Co","tags":["a|b","<c>"]}',
    'C:\\temp\\',
    'a\\"b',
    '"',
    '\\\\server\\share\\\\',
    '100% %PATH% %% %1 %~dp0',
    '^caret^ !bang! (paren)',
    '<tag attr="x">&amp;</tag>',
    'two\nlines',
    'naïve 中文 tab\there'
  ])('cmd.exe and curl.exe read %j back exactly', (text) => {
    const line = toCurlCmd({ method: 'POST', url: 'https://a.test/?q=1&r=%41', headers: { 'X-Text': text }, body: text })
    const argv = runtimeArgs(cmdReads(line, { PATH: 'C:\\Windows', 1: 'one' }))
    expect(argv).toEqual(['curl.exe', '-X', 'POST', 'https://a.test/?q=1&r=%41', '-H', `X-Text: ${text}`, '--data-raw', text])
  })
})

describe('generateCode', () => {
  it('dispatches by target', () => {
    expect(generateCode(built, 'curl').startsWith('curl')).toBe(true)
    expect(generateCode(built, 'curl-cmd').startsWith('curl.exe ')).toBe(true)
    expect(generateCode(built, 'fetch').startsWith('await fetch')).toBe(true)
  })
})
