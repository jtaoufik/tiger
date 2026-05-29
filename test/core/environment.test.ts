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
