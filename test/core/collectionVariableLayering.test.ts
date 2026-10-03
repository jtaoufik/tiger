import { describe, expect, it } from 'vitest'
import { layerCollectionVariables, type ImportResult } from '../../src/core/import'
import { envToVars, interpolate } from '../../src/core/interpolate'
import type { TigerEnvironment } from '../../src/core/types'

const shop = (overrides: Partial<ImportResult>): ImportResult => ({
  name: 'Shop',
  source: 'postman',
  requests: [],
  ...overrides
})

const resolve = (env: TigerEnvironment | undefined, text: string) => interpolate(text, envToVars(env))

describe('Postman variable layers in one Tiger scope', () => {
  const layered = layerCollectionVariables(
    shop({
      collectionVariables: [{ name: 'baseUrl', value: 'https://api.shop.test', enabled: true }],
      environments: [
        {
          name: 'Staging',
          variables: [
            { name: 'baseUrl', value: 'https://staging.shop.test', enabled: false },
            { name: 'token', value: 't0k', enabled: true }
          ]
        }
      ]
    })
  )
  const staging = layered.environments![0]

  it('a disabled environment variable does not hide the collection variable of the same name', () => {
    expect(resolve(staging, '{{baseUrl}}/orders')).toBe('https://api.shop.test/orders')
  })

  it('switching the environment row on makes it win again, as in Postman', () => {
    const on = { ...staging, variables: staging.variables.map((v) => ({ ...v, enabled: true })) }
    expect(resolve(on, '{{baseUrl}}/orders')).toBe('https://staging.shop.test/orders')
  })

  it('a disabled collection variable does not hide the global of the same name', () => {
    const result = layerCollectionVariables(
      shop({
        collectionVariables: [{ name: 'tenant', value: 'from-collection', enabled: false }],
        globals: [{ name: 'tenant', value: 'acme', enabled: true }]
      })
    )
    expect(resolve(result.environments![0], '{{tenant}}')).toBe('acme')
  })
})
