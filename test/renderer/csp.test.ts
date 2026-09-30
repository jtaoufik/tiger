import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const renderer = resolve(__dirname, '../../src/renderer')

function csp(file: string): Record<string, string[]> {
  const html = readFileSync(join(renderer, file), 'utf8')
  const m = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)
  if (!m) throw new Error(`${file} has no CSP meta tag`)
  const out: Record<string, string[]> = {}
  for (const part of m[1].split(';')) {
    const [name, ...values] = part.trim().split(/\s+/)
    if (name) out[name] = values
  }
  return out
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return sources(p)
    return /\.(ts|tsx)$/.test(name) ? [p] : []
  })
}

describe('app window CSP', () => {
  const policy = csp('index.html')

  it('never allows eval in the app window', () => {
    // Collection scripts can come from third parties and this window holds
    // window.tiger (file and repository IPC). Scripts run in the isolated script host.
    const all = Object.values(policy).flat()
    expect(all).not.toContain("'unsafe-eval'")
    expect(all).not.toContain("'wasm-unsafe-eval'")
    expect(policy['script-src']).toBeDefined()
    expect(policy['script-src']).not.toContain("'unsafe-inline'")
  })
})

describe('script host CSP', () => {
  const policy = csp('script-host.html')

  it('may eval but can load nothing else and connect nowhere', () => {
    expect(policy['default-src']).toEqual(["'none'"])
    expect(policy['script-src']).toEqual(["'self'", "'unsafe-eval'"])
    expect(policy['connect-src']).toEqual(["'none'"])
    for (const d of ['img-src', 'frame-src', 'child-src', 'worker-src', 'object-src', 'form-action']) {
      expect(policy[d], d).toEqual(["'none'"])
    }
  })
})

describe('app window code never evaluates scripts itself', () => {
  const appFiles = sources(join(renderer, 'src'))

  it('has no eval, new Function or string timers', () => {
    for (const file of appFiles) {
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toMatch(/\bnew Function\s*\(/)
      expect(text, file).not.toMatch(/(^|[^.\w])eval\s*\(/)
      expect(text, file).not.toMatch(/set(Timeout|Interval)\(\s*['"`]/)
    }
  })

  it('imports runScript only as a type (evaluation lives in the script host)', () => {
    for (const file of appFiles) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+['"]@core\/script['"]/g)) {
        if (m[1]) continue
        const names = m[2].split(',').map((s) => s.trim())
        expect(
          names.filter((n) => n === 'runScript'),
          file
        ).toEqual([])
      }
      expect(text, file).not.toMatch(/from\s+['"]@core\/scriptProtocol['"]/)
    }
  })
})
