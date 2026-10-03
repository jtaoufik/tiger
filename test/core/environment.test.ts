import { describe, expect, it } from 'vitest'
import { parseEnvironment, serializeEnvironment } from '../../src/core/environment'
import type { TigerEnvironment } from '../../src/core/types'

const env: TigerEnvironment = {
  name: 'dev',
  variables: [
    { name: 'baseUrl', value: 'https://api.test', enabled: true },
    { name: 'token', value: 'secret', enabled: false }
  ]
}

describe('secret variables', () => {
  it('round-trips secret vars through a vars:secret block', () => {
    const env: TigerEnvironment = {
      name: 'prod',
      variables: [
        { name: 'baseUrl', value: 'https://api.test', enabled: true },
        { name: 'token', value: 'hush', enabled: true, secret: true }
      ]
    }
    const text = serializeEnvironment(env)
    expect(text).toContain('vars:secret {')
    expect(parseEnvironment(text)).toEqual(env)
  })
})

describe('parseEnvironment', () => {
  it('reads the name and variables', () => {
    const parsed = parseEnvironment('meta {\n  name: dev\n}\nvars {\n  baseUrl: https://api.test\n}')
    expect(parsed.name).toBe('dev')
    expect(parsed.variables).toEqual([
      { name: 'baseUrl', value: 'https://api.test', enabled: true }
    ])
  })

  it('round-trips through serialize', () => {
    expect(parseEnvironment(serializeEnvironment(env))).toEqual(env)
  })
})

describe('looksLikeProduction', () => {
  it('recognises production however it is spelled, and nothing else', async () => {
    const { looksLikeProduction } = await import('../../src/core/environment')
    for (const name of ['Prod', 'production', 'live-eu', 'prod_eu', 'PROD_US', 'prodEU', 'prd', 'Prod2', 'EU Production', 'my-api (prod)']) {
      expect(looksLikeProduction(name), name).toBe(true)
    }
    for (const name of ['preprod', 'products', 'liveness', 'dev', 'staging', 'Productivity', 'reproduce']) {
      expect(looksLikeProduction(name), name).toBe(false)
    }
  })
})
