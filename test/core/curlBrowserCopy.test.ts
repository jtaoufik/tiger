import { describe, expect, it } from 'vitest'
import { importCurl } from '../../src/core/import/curl'
import { buildRequest } from '../../src/core/request'

const parse = (command: string) => {
  const request = importCurl(command)
  if (!request) throw new Error(`not parsed: ${command}`)
  return request
}

const contentType = (headers: Record<string, string>) =>
  Object.entries(headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1]

describe('curl: "Copy as cURL (bash)" from Chrome and Firefox', () => {
  // Browsers switch to $'...' quoting for a value with an apostrophe, a "!",
  // a control character or (Firefox) any non-ASCII character.
  it("reads $'...' bodies: escaped apostrophes and backslashes", () => {
    const request = parse(`curl 'https://api.shop.test/v1/notes?a=1&b=2' \\
  -H 'accept: application/json' \\
  -H 'content-type: application/json' \\
  -b 'session=abc; theme=dark' \\
  --data-raw $'{"title":"Ada\\'s list","body":"line1\\\\nline2"}'`)
    expect(request.url).toBe('https://api.shop.test/v1/notes?a=1&b=2')
    expect(request.body).toEqual({ type: 'json', content: '{"title":"Ada\'s list","body":"line1\\nline2"}' })
    expect(request.headers.map((h) => h.name)).toEqual(['accept', 'content-type', 'Cookie'])
  })

  it('reads \\u, \\x and control escapes, as Chrome and Firefox write them', () => {
    // Chrome writes "!" as \u0021; Firefox writes é as \xe9 (Latin-1) and an emoji as two \u halves.
    const request = parse(`curl https://x.test --data-raw $'{"msg":"Hi\\u0021 Caf\\xe9 \\ud83d\\udc2f\\tend"}'`)
    expect(request.body.content).toBe('{"msg":"Hi! Café 🐯\tend"}')
    // Bytes that form UTF-8 (from a shell user) decode as UTF-8.
    expect(parse(`curl https://x.test -d $'name=Caf\\xc3\\xa9'`).body.content).toBe('name: Café')
  })

  it('keeps backslash escapes inside "double quotes" that bash keeps', () => {
    const request = parse(`curl https://x.test -H 'Content-Type: application/json' -d "{\\"text\\":\\"a\\nb \\$5\\"}"`)
    expect(request.body.content).toBe('{"text":"a\\nb $5"}')
  })

  it('reads a URL whose [ ] { } the browser escaped for curl globbing', () => {
    expect(parse(`curl 'https://api.test/items?filter\\[status\\]=active&f=\\{a\\}'`).url).toBe(
      'https://api.test/items?filter[status]=active&f={a}'
    )
    // With -g curl leaves them alone, and so does Tiger.
    expect(parse(`curl -g 'https://api.test/x?a\\[0\\]=1'`).url).toBe('https://api.test/x?a\\[0\\]=1')
  })

  it('keeps a header sent with an empty value (-H "name;")', () => {
    expect(parse(`curl https://x.test -H 'x-empty;'`).headers).toEqual([{ name: 'x-empty', value: '', enabled: true }])
  })
})

describe('curl: "Copy as cURL (cmd)" from Chrome, Edge and Firefox on Windows', () => {
  it('reads ^" quoting, ^ line continuations and \\" inside values', () => {
    const request = parse(`curl ^"https://api.shop.test/v1/notes?a=1^&b=2^" ^
  -H ^"accept: application/json^" ^
  -H ^"content-type: application/json^" ^
  -b ^"session=abc; theme=dark^" ^
  --data-raw ^"^{^\\^"title^\\^":^\\^"Ada^\\^"^}^"`)
    expect(request.url).toBe('https://api.shop.test/v1/notes?a=1&b=2')
    expect(request.headers).toEqual([
      { name: 'accept', value: 'application/json', enabled: true },
      { name: 'content-type', value: 'application/json', enabled: true },
      { name: 'Cookie', value: 'session=abc; theme=dark', enabled: true }
    ])
    expect(request.body).toEqual({ type: 'json', content: '{"title":"Ada"}' })
  })

  it('reads a multi-line body, %^ and doubled backslashes', () => {
    // {"path":"C:\\temp","pct":"50%x"} followed by a newline and a second line.
    const request = parse(
      'curl ^"https://x.test/^" ^\n  -H ^"content-type: application/json^" ^\n' +
        '  --data-raw ^"^{^\\^"path^\\^":^\\^"C:^\\^\\^\\^\\temp^\\^",^\\^"pct^\\^":^\\^"50^%^x^\\^"^}^\n\nsecond line^"'
    )
    expect(request.url).toBe('https://x.test/')
    expect(request.body.content).toBe('{"path":"C:\\\\temp","pct":"50%x"}\nsecond line')
  })

  it('reads an escaped URL with brackets and a method', () => {
    const request = parse('curl ^"https://api.test/items?filter^\\[status^\\]=active^" -X ^"DELETE^"')
    expect(request.url).toBe('https://api.test/items?filter[status]=active')
    expect(request.method).toBe('delete')
  })
})

describe('curl: what curl itself sends', () => {
  it('sends -d k=v as a form, application/x-www-form-urlencoded, as curl does', () => {
    const request = parse(`curl https://api.stripe.test/v1/charges \\
  -u sk_test_123: \\
  -d amount=2000 \\
  -d currency=usd \\
  -d "description=Charge for ada@example.com"`)
    expect(request.body).toEqual({
      type: 'form',
      content: 'amount: 2000\ncurrency: usd\ndescription: Charge for ada@example.com'
    })
    const built = buildRequest(request)
    expect(contentType(built.headers)).toBe('application/x-www-form-urlencoded')
    expect(built.body).toBe('amount=2000&currency=usd&description=Charge+for+ada%40example.com')
    expect(request.auth).toEqual({ type: 'basic', username: 'sk_test_123', password: '' })
  })

  it('decodes what -d already encoded, and keeps --data-urlencode values as written', () => {
    const request = parse(`curl https://x.test -d 'redirect=https%3A%2F%2Fapp.test%2Fcb&q=a+b' --data-urlencode 'note=1+1=2'`)
    expect(request.body.content).toBe('redirect: https://app.test/cb\nq: a b\nnote: 1+1=2')
    expect(buildRequest(request).body).toBe('redirect=https%3A%2F%2Fapp.test%2Fcb&q=a+b&note=1%2B1%3D2')
  })

  it('sends data that is not name=value pairs as it is, still with curl\'s form Content-Type', () => {
    const built = buildRequest(parse(`curl https://x.test -d 'just some text'`))
    expect(built.body).toBe('just some text')
    expect(contentType(built.headers)).toBe('application/x-www-form-urlencoded')
  })

  it('keeps an explicit Content-Type and the JSON shortcut', () => {
    expect(parse(`curl https://x.test -H 'Content-Type: text/plain' -d 'a=1'`).body).toEqual({ type: 'text', content: 'a=1' })
    expect(parse(`curl https://x.test -d '{"a":1}'`).body).toEqual({ type: 'json', content: '{"a":1}' })
  })

  it('reads short options with their value attached (-XPUT, -HName:v, -uuser:pw) and grouped flags', () => {
    expect(parse(`curl -XPUT 'http://localhost:9200/twitter/_doc/1' -H 'Content-Type: application/json' -d '{"user":"kimchy"}'`).method).toBe('put')
    expect(parse(`curl -XDELETE http://localhost:9200/twitter`).method).toBe('delete')
    const grouped = parse(`curl -sSLX PATCH -HX-Trace:1 -uada:pw https://x.test/a`)
    expect(grouped.method).toBe('patch')
    expect(grouped.headers).toEqual([{ name: 'X-Trace', value: '1', enabled: true }])
    expect(grouped.auth).toEqual({ type: 'basic', username: 'ada', password: 'pw' })
    expect(grouped.url).toBe('https://x.test/a')
  })

  it('sends -I as HEAD', () => {
    expect(parse('curl -I https://x.test').method).toBe('head')
  })

  it('accepts curl.exe (Windows PowerShell) and a copied "$ " prompt', () => {
    const exe = parse(`curl.exe -X POST "https://api.shop.test/v1/notes" -H "Content-Type: application/json" -d "{\\"title\\":\\"Ada\\"}"`)
    expect(exe.method).toBe('post')
    expect(exe.body).toEqual({ type: 'json', content: '{"title":"Ada"}' })
    expect(parse('$ curl https://x.test/me').url).toBe('https://x.test/me')
  })
})
