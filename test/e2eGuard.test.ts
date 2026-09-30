import { describe, expect, it } from 'vitest'
import { isLoopbackOrLocal } from '../src/main/e2eGuard'

describe('e2e network guard', () => {
  it('lets loopback HTTP through', () => {
    expect(isLoopbackOrLocal('http://127.0.0.1:4321/posts')).toBe(true)
    expect(isLoopbackOrLocal('http://localhost/x')).toBe(true)
    expect(isLoopbackOrLocal('http://[::1]:80/')).toBe(true)
  })

  it('lets local app resources through', () => {
    expect(isLoopbackOrLocal('file:///app/out/renderer/index.html')).toBe(true)
    expect(isLoopbackOrLocal('devtools://devtools/bundled/inspector.html')).toBe(true)
    expect(isLoopbackOrLocal('data:text/plain,hi')).toBe(true)
  })

  it('blocks every remote host, including look-alikes', () => {
    expect(isLoopbackOrLocal('https://jtaoufik.github.io/tiger/version.json')).toBe(false)
    expect(isLoopbackOrLocal('https://www.google-analytics.com/g/collect')).toBe(false)
    expect(isLoopbackOrLocal('http://localhost.evil.com/')).toBe(false)
    expect(isLoopbackOrLocal('wss://example.com/socket')).toBe(false)
    expect(isLoopbackOrLocal('not a url')).toBe(false)
  })
})
