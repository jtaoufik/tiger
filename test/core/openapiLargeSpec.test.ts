// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { importOpenApi } from '../../src/core/import'

/**
 * The shape of the big generated specs (Kubernetes, Stripe, GitHub): 2,000
 * operations, 300 schemas of 25 properties, 6 of which link to other schemas.
 */
function enterpriseSpec(): unknown {
  let seed = 42
  const pick = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed % n
  }
  const ref = () => ({ $ref: `#/components/schemas/Model${pick(300)}` })
  const schemas: Record<string, unknown> = {}
  for (let s = 0; s < 300; s++) {
    const properties: Record<string, unknown> = {}
    for (let p = 0; p < 25; p++) {
      if (p < 6) properties[`rel${p}`] = p % 2 === 0 ? ref() : { type: 'array', items: ref() }
      else properties[`field${p}`] = { type: ['integer', 'string', 'boolean'][p % 3] }
    }
    schemas[`Model${s}`] = { type: 'object', properties }
  }
  const paths: Record<string, unknown> = {}
  for (let i = 0; i < 400; i++) {
    paths[`/resource${i}/{id}`] = Object.fromEntries(
      ['get', 'post', 'put', 'patch', 'delete'].map((method) => [
        method,
        {
          summary: `${method} ${i}`,
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          ...(method === 'get' || method === 'delete'
            ? {}
            : { requestBody: { content: { 'application/json': { schema: ref() } } } })
        }
      ])
    )
  }
  return { openapi: '3.0.3', info: { title: 'Huge' }, servers: [{ url: 'https://huge.example' }], paths, components: { schemas } }
}

describe('OpenAPI: a large spec with linked schemas', () => {
  it('imports quickly, with example bodies of a readable size', () => {
    const spec = enterpriseSpec()
    const started = performance.now()
    const result = importOpenApi(spec)
    const ms = performance.now() - started
    const sizes = result.requests.map((r) => r.request.body.content.length)
    expect(result.requests).toHaveLength(2000)
    // Every link expanded four levels deep gave bodies up to 150 KB, 180 MB in all.
    expect(Math.max(...sizes)).toBeLessThan(20_000)
    expect(sizes.reduce((a, b) => a + b, 0)).toBeLessThan(15_000_000)
    // About 0.1 s alone (1.5 s before); generous, as other suites share the machine.
    expect(ms).toBeLessThan(3000)
  })

  it('still fills every top-level property of a body', () => {
    const result = importOpenApi(enterpriseSpec())
    const post = result.requests.find((r) => r.request.method === 'post')!
    const body = JSON.parse(post.request.body.content) as Record<string, unknown>
    expect(Object.keys(body)).toHaveLength(25)
    expect(body.field6).toBe(0)
  })
})
