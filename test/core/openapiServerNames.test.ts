import { describe, expect, it } from 'vitest'
import { importOpenApi } from '../../src/core/import'
import { looksLikeProduction } from '../../src/core/environment'

const names = (servers: unknown[]) =>
  importOpenApi({ openapi: '3.0.3', info: { title: 'Shop' }, servers, paths: { '/ping': { get: {} } } }).environments?.map(
    (e) => e.name
  )

describe('OpenAPI servers become environments the app never selects for production by surprise', () => {
  it('names a server that does not say it is a test one Production, so it is not picked by itself', () => {
    const envs = names([{ url: 'https://api.shop.example/v2' }, { url: 'https://sandbox.shop.example/v2' }])
    expect(envs).toEqual(['Production (api.shop.example)', 'sandbox.shop.example'])
    // The first environment the app may pick is the sandbox, not production.
    expect(envs?.find((name) => !looksLikeProduction(name))).toBe('sandbox.shop.example')
  })

  it('keeps the host of a staging, dev, test, QA or local server', () => {
    expect(
      names([
        { url: 'https://staging2.api.example.com' },
        { url: 'https://api-dev.example.com/v1' },
        { url: 'https://qa.example.com' },
        { url: 'http://localhost:8080/api' },
        { url: 'http://127.0.0.1:3000' },
        { url: 'https://api.shop.test' }
      ])
    ).toEqual(['staging2.api.example.com', 'api-dev.example.com', 'qa.example.com', 'localhost:8080', '127.0.0.1:3000', 'api.shop.test'])
  })

  it('does not take a word that only contains "dev" or "test" for a test server', () => {
    expect(names([{ url: 'https://devices.example.com' }, { url: 'https://latest.example.com' }])).toEqual([
      'Production (devices.example.com)',
      'Production (latest.example.com)'
    ])
  })

  it('keeps the description a server has', () => {
    expect(names([{ url: 'https://api.shop.example', description: 'Main' }])).toEqual(['Main'])
  })

  it('reads a templated host with its variables at their defaults', () => {
    expect(
      names([{ url: 'https://{env}.api.example.com', variables: { env: { default: 'dev', enum: ['dev', 'www'] } } }])
    ).toEqual(['dev.api.example.com'])
  })

  it('names a Swagger 2 host the same way', () => {
    const result = importOpenApi({ swagger: '2.0', host: 'petstore.swagger.io', basePath: '/v2', paths: { '/pet': { get: {} } } })
    expect(result.environments?.map((e) => e.name)).toEqual(['Production (petstore.swagger.io)'])
  })
})
