/**
 * Parse a pasted curl command into a request. Covers the flags people
 * actually copy from browsers and docs: -X, -H, --data variants, --json,
 * -F (multipart, `@path` for files), -G, -I, -u, -b (cookie), -A, -e, the
 * URL, in both shells browsers copy for: bash ("Copy as cURL (bash)", with
 * $'...' quoting) and Windows cmd ("Copy as cURL (cmd)", with ^ escapes).
 */

import { emptyBody, isHttpMethod, type KeyValue, type TigerBody, type TigerRequest } from '../types'

/** Short options that take a value, which may be attached: `-XPUT` is `-X PUT`. */
const SHORT_VALUE = new Set([...'AbcCdDeEFHKmoPQrtTuUwxXyYz'].map((c) => `-${c}`))

/**
 * Flags that take a following value we don't model but must consume, so the
 * value can never be mistaken for the URL.
 */
const VALUE_FLAGS = new Set([
  ...SHORT_VALUE,
  '--output',
  '--connect-timeout',
  '--max-time',
  '--cookie-jar',
  '--write-out',
  '--upload-file',
  '--retry',
  '--max-redirs',
  '--proxy',
  '--cert',
  '--key',
  '--cacert',
  '--header-file',
  '--resolve'
])

/** Escapes of bash's $'...' quoting (besides \xHH, octal, \uHHHH and \UHHHHHHHH). */
const ANSI_C: Record<string, string> = {
  a: '\x07',
  b: '\b',
  e: '\x1b',
  E: '\x1b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
  '\\': '\\',
  "'": "'",
  '"': '"',
  '?': '?'
}

/**
 * Bytes from \x and octal escapes: UTF-8 when they form it (a shell user's
 * $'Caf\xc3\xa9'), else one character each (Firefox writes é as \xe9).
 */
function decodeBytes(bytes: number[]): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes))
  } catch {
    return String.fromCharCode(...bytes)
  }
}

/** The text of a $'...' string, its escapes resolved. */
function ansiC(text: string): string {
  let out = ''
  let bytes: number[] = []
  const flush = () => {
    if (bytes.length) out += decodeBytes(bytes)
    bytes = []
  }
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '\\' || i + 1 === text.length) {
      flush()
      out += text[i]
      continue
    }
    const rest = text.slice(i + 1)
    const byte = /^x([0-9a-fA-F]{1,2})/.exec(rest) ?? /^()([0-7]{1,3})/.exec(rest)
    if (byte) {
      bytes.push(byte[2] ? parseInt(byte[2], 8) & 0xff : parseInt(byte[1], 16))
      i += byte[0].length
      continue
    }
    flush()
    const unicode = /^u([0-9a-fA-F]{1,4})/.exec(rest) ?? /^U([0-9a-fA-F]{1,8})/.exec(rest)
    const code = unicode ? parseInt(unicode[1], 16) : -1
    if (unicode && code <= 0x10ffff) {
      out += code > 0xffff ? String.fromCodePoint(code) : String.fromCharCode(code)
      i += unicode[0].length
    } else if (rest[0] in ANSI_C) {
      out += ANSI_C[rest[0]]
      i++
    } else {
      out += `\\${rest[0]}` // not an escape: bash keeps both characters
      i++
    }
  }
  flush()
  return out
}

/**
 * Words of a command as bash reads them: 'single', "double" (where \ only
 * escapes \ " $ ` and a line break), $'ANSI-C', \-escapes and \ line
 * continuations, adjacent pieces making one word.
 */
function bashWords(input: string): string[] {
  const out: string[] = []
  let word: string | null = null
  const add = (text: string) => (word = (word ?? '') + text)
  for (let i = 0; i < input.length; i++) {
    const c = input[i]
    if (c === '\\' && input[i + 1] === '\n') {
      i++
    } else if (/\s/.test(c)) {
      if (word !== null) out.push(word)
      word = null
    } else if (c === '\\') {
      add(input[++i] ?? '')
    } else if (c === "'") {
      const end = input.indexOf("'", i + 1)
      add(input.slice(i + 1, end === -1 ? undefined : end))
      i = end === -1 ? input.length : end
    } else if (c === '$' && input[i + 1] === "'") {
      let j = i + 2
      while (j < input.length && input[j] !== "'") j += input[j] === '\\' ? 2 : 1
      add(ansiC(input.slice(i + 2, j)))
      i = j
    } else if (c === '"') {
      let text = ''
      let j = i + 1
      for (; j < input.length && input[j] !== '"'; j++) {
        if (input[j] === '\\' && input[j + 1] === '\n') j++
        else if (input[j] === '\\' && '\\"$`'.includes(input[j + 1] ?? '')) text += input[++j]
        else text += input[j]
      }
      add(text)
      i = j
    } else {
      add(c)
    }
  }
  if (word !== null) out.push(word)
  return out
}

/**
 * Words of a Windows cmd command, as Chrome, Edge and Firefox write "Copy as
 * cURL (cmd)": ^ escapes the next character (a ^ before a line break
 * continues the line), and "double quotes" use \" and \\ for a quote and a
 * backslash, the browsers escaping every backslash that way.
 */
function cmdWords(input: string): string[] {
  const text = input.replace(/\^\n/g, '').replace(/\^([\s\S])/g, '$1')
  const out: string[] = []
  let word: string | null = null
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (/\s/.test(c)) {
      if (word !== null) out.push(word)
      word = null
    } else if (c === '"') {
      word ??= ''
      let j = i + 1
      for (; j < text.length; j++) {
        if (text[j] === '\\' && (text[j + 1] === '"' || text[j + 1] === '\\')) word += text[++j]
        else if (text[j] === '"' && text[j + 1] === '"') word += text[++j]
        else if (text[j] === '"') break
        else word += text[j]
      }
      i = j
    } else {
      word = (word ?? '') + c
    }
  }
  if (word !== null) out.push(word)
  return out
}

/** Split a pasted command into words, in the shell it was copied for. */
function words(command: string): string[] {
  const input = command.replace(/\r\n?/g, '\n').trim()
  const cmd = /^\S*\s+\^"/.test(input) || /\s\^\n/.test(input)
  return cmd ? cmdWords(input) : bashWords(input)
}

/** `-sSLXPUT` is `-s -S -L -X PUT`: curl reads short options one letter at a time. */
function expandShort(arg: string): string[] {
  const out: string[] = []
  for (let i = 1; i < arg.length; i++) {
    const flag = `-${arg[i]}`
    out.push(flag)
    if (SHORT_VALUE.has(flag)) {
      if (i + 1 < arg.length) out.push(arg.slice(i + 1))
      break
    }
  }
  return out
}

/** One --data argument: --data-urlencode values are sent encoded, the others as written. */
interface DataChunk {
  text: string
  urlencode: boolean
}

/**
 * `name: value` lines of a form body for the data, or null when it is not
 * plain name=value pairs that the lines can hold (curl then sends it as it is).
 */
function formLines(data: DataChunk[]): string | null {
  const lines: string[] = []
  for (const chunk of data) {
    const pairs = chunk.urlencode ? [chunk.text] : chunk.text.split('&').filter(Boolean)
    for (const pair of pairs) {
      const at = pair.indexOf('=')
      if (at <= 0) return null
      let name = pair.slice(0, at)
      let value = pair.slice(at + 1)
      try {
        if (!chunk.urlencode) value = decodeURIComponent(value.replace(/\+/g, ' '))
        name = decodeURIComponent(name.replace(/\+/g, ' '))
      } catch {
        return null
      }
      const fits = (s: string) => s === s.trim() && !/[\r\n]/.test(s)
      if (!fits(name) || !fits(value) || name.includes(':') || /^(~|#|\/\/)/.test(name)) return null
      lines.push(`${name}: ${value}`)
    }
  }
  return lines.length ? lines.join('\n') : null
}

export function importCurl(command: string): TigerRequest | null {
  const parts = words(command)
  if (parts[0] === '$') parts.shift() // a copied shell prompt
  // `curl.exe` is what Windows PowerShell users type: `curl` is an alias there.
  if (!/^(?:.*[\\/])?curl(?:\.exe)?$/i.test(parts[0] ?? '')) return null

  let method = ''
  let url = ''
  const headers: KeyValue[] = []
  const data: DataChunk[] = []
  let jsonBody: string | null = null
  let basic: string | null = null
  let getWithData = false
  let head = false
  let globoff = false
  const form: string[] = []
  const addHeader = (name: string, value: string) => headers.push({ name, value, enabled: true })

  for (let i = 1; i < parts.length; i++) {
    if (/^-[^-]./.test(parts[i])) parts.splice(i, 1, ...expandShort(parts[i]))
    const arg = parts[i]
    if (arg === '-X' || arg === '--request') method = parts[++i]?.toLowerCase() ?? ''
    else if (arg === '-H' || arg === '--header') {
      const raw = parts[++i] ?? ''
      const idx = raw.indexOf(':')
      if (idx > 0) headers.push({ name: raw.slice(0, idx).trim(), value: raw.slice(idx + 1).trim(), enabled: true })
      // "name;" sends the header with an empty value.
      else if (/^[^\s:;]+;$/.test(raw)) addHeader(raw.slice(0, -1), '')
    } else if (
      arg === '-d' ||
      arg === '--data' ||
      arg === '--data-raw' ||
      arg === '--data-binary' ||
      arg === '--data-ascii' ||
      arg === '--data-urlencode'
    ) {
      data.push({ text: parts[++i] ?? '', urlencode: arg === '--data-urlencode' })
    } else if (arg === '--json') {
      jsonBody = parts[++i] ?? ''
    } else if (arg === '-G' || arg === '--get') getWithData = true
    else if (arg === '-I' || arg === '--head') head = true
    else if (arg === '-g' || arg === '--globoff') globoff = true
    else if (arg === '-A' || arg === '--user-agent') addHeader('User-Agent', parts[++i] ?? '')
    else if (arg === '-e' || arg === '--referer') addHeader('Referer', parts[++i] ?? '')
    else if (arg === '-b' || arg === '--cookie') {
      const value = parts[++i] ?? ''
      // A value without "=" is a cookie FILE name, which we cannot read.
      if (value.includes('=')) addHeader('Cookie', value)
    } else if (arg === '-u' || arg === '--user') basic = parts[++i] ?? ''
    else if (arg === '--url') url = parts[++i] ?? ''
    else if (arg === '-F' || arg === '--form' || arg === '--form-string') {
      const raw = parts[++i] ?? ''
      const idx = raw.indexOf('=')
      if (idx > 0) {
        const name = raw.slice(0, idx)
        const value = raw.slice(idx + 1)
        // `name=@path;type=...` uploads a file; `<path` reads a file as text.
        const file = arg !== '--form-string' && value.startsWith('@')
        form.push(file ? `${name}: @file:${value.slice(1).split(';')[0]}` : `${name}: ${value}`)
      }
    }
    else if (arg.startsWith('-')) {
      // Other flags that take a value: consume it so the value never becomes
      // the URL. (Bare flags fall through and are simply ignored.)
      if (VALUE_FLAGS.has(arg)) i++
    } else if (!url) {
      url = arg
    }
  }

  if (!url) return null
  // curl globs [ ] { } in a URL (unless -g), so browsers escape them as \[ \] \{ \}.
  if (!globoff) url = url.replace(/\\([[\]{}])/g, '$1')
  // Repeated -d flags are joined with & like curl does.
  let raw = jsonBody ?? (data.length ? data.map((d) => d.text).join('&') : null)
  if (getWithData && raw !== null) {
    url += (url.includes('?') ? '&' : '?') + raw
    raw = null
  }
  if (!method) method = head ? 'head' : raw !== null || form.length ? 'post' : 'get'
  if (!isHttpMethod(method)) return null

  const contentType = headers.find((h) => h.name.toLowerCase() === 'content-type')?.value ?? ''
  const json = jsonBody !== null || /json/i.test(contentType) || (!contentType && /^\s*[{[]/.test(raw ?? ''))
  let body: TigerBody = emptyBody()
  if (form.length) body = { type: 'multipart', content: form.join('\n') }
  else if (raw === null) body = emptyBody()
  else if (json) body = { type: 'json', content: raw }
  else if (contentType && !/x-www-form-urlencoded/i.test(contentType)) body = { type: 'text', content: raw }
  else {
    // curl sends --data as application/x-www-form-urlencoded: a form when it
    // is name=value pairs, else the data as it is with that Content-Type.
    const lines = formLines(data)
    if (lines !== null) body = { type: 'form', content: lines }
    else {
      body = { type: 'text', content: raw }
      if (!contentType) addHeader('Content-Type', 'application/x-www-form-urlencoded')
    }
  }
  const request: TigerRequest = { name: `Imported from curl`, method, url, headers, query: [], body }
  if (basic) {
    const idx = basic.indexOf(':')
    request.auth = {
      type: 'basic',
      username: idx === -1 ? basic : basic.slice(0, idx),
      password: idx === -1 ? '' : basic.slice(idx + 1)
    }
  }
  return request
}
