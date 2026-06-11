import { describe, expect, it } from 'vitest'
import { importCurl } from '../../src/core/import/curl'

describe('importCurl', () => {
  it('parses method, url, headers and json body', () => {
    const req = importCurl(
      `curl -X POST 'https://api.test/users' -H 'Content-Type: application/json' --data '{"name":"Ada"}'`
    )!
    expect(req.method).toBe('post')
    expect(req.url).toBe('https://api.test/users')
    expect(req.headers).toEqual([
      { name: 'Content-Type', value: 'application/json', enabled: true }
    ])
    expect(req.body).toEqual({ type: 'json', content: '{"name":"Ada"}' })
  })

  it('defaults to GET without a body and POST with one', () => {
    expect(importCurl('curl https://api.test/x')!.method).toBe('get')
    expect(importCurl("curl https://api.test/x -d 'a=1'")!.method).toBe('post')
  })

  it('maps -u to basic auth', () => {
    const req = importCurl('curl -u admin:s3cret https://api.test/x')!
    expect(req.auth).toEqual({ type: 'basic', username: 'admin', password: 's3cret' })
  })

  it('handles double quotes and multiline continuations', () => {
    const req = importCurl('curl "https://api.test/y" \\\n  -H "Accept: application/json"')!
    expect(req.url).toBe('https://api.test/y')
    expect(req.headers[0].name).toBe('Accept')
  })

  it('treats --data-urlencode as a body source (and defaults to POST)', () => {
    const req = importCurl(`curl https://api.test/x --data-urlencode 'name=Ada Lovelace'`)!
    expect(req.method).toBe('post')
    expect(req.url).toBe('https://api.test/x')
    expect(req.body).toEqual({ type: 'text', content: 'name=Ada Lovelace' })
  })

  it('never lets a value-taking flag value become the URL', () => {
    // -o output.txt, -b cookie.txt, -x proxy.example precede the real URL.
    const req = importCurl(
      `curl -o out.txt -b 'session=1' -x http://proxy.example:8080 https://api.test/real`
    )!
    expect(req.url).toBe('https://api.test/real')
  })

  it('does not consume the URL after --data-urlencode when --url is explicit', () => {
    const req = importCurl(`curl --data-urlencode 'q=1' --url https://api.test/u`)!
    expect(req.url).toBe('https://api.test/u')
    expect(req.body?.content).toBe('q=1')
  })

  it('rejects text that is not a curl command', () => {
    expect(importCurl('wget https://api.test')).toBeNull()
    expect(importCurl('curl')).toBeNull()
  })
})
