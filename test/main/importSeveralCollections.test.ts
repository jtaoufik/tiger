import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  dialog: {}
}))

import { importPaths } from '../../src/main/importers'
import { mergeImports } from '../../src/main/importHelpers'
import { importPostman, layerCollectionVariables, type ImportResult } from '../../src/core/import'
import { envToVars } from '../../src/core/interpolate'
import { buildRequest } from '../../src/core/request'
import type { TigerEnvironment, TigerRequest } from '../../src/core/types'

/** A Postman collection whose requests use its own collection variables. */
const postman = (name: string, variables: Record<string, string>, extra: Record<string, unknown> = {}) =>
  importPostman({
    info: { name, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    item: [{ name: `Ping ${name}`, request: { method: 'GET', url: '{{baseUrl}}/ping' }, ...extra }],
    variable: Object.entries(variables).map(([key, value]) => ({ key, value }))
  })

const merge = (...items: Array<[string, ImportResult]>) =>
  layerCollectionVariables(mergeImports(items.map(([name, result]) => ({ name, result })), 'postman', 'exports'))

const find = (result: ImportResult, name: string): TigerRequest => {
  const found = result.requests.find((r) => r.request.name === name)
  if (!found) throw new Error(`no request ${name}`)
  return found.request
}

/** The URL Send uses with this environment selected. */
const sentTo = (result: ImportResult, name: string, env: TigerEnvironment | undefined) =>
  buildRequest(find(result, name), envToVars(env)).url

const env = (result: ImportResult, name: string) => result.environments?.find((e) => e.name === name)

describe('several collections imported together', () => {
  it('sends each collection\'s requests to its own host', () => {
    const merged = merge(
      ['alpha', postman('Alpha', { baseUrl: 'https://alpha.test' })],
      ['beta', postman('Beta', { baseUrl: 'https://beta.test' })]
    )
    const selected = merged.environments![0]
    expect(sentTo(merged, 'Ping Alpha', selected)).toBe('https://alpha.test/ping')
    expect(sentTo(merged, 'Ping Beta', selected)).toBe('https://beta.test/ping')
    expect(find(merged, 'Ping Beta').url).toBe('{{Beta.baseUrl}}/ping')
    const note = merged.warnings?.find((w) => w.i18n?.key === 'imports.variablesRenamed')
    expect(note).toMatchObject({ request: 'beta', i18n: { vars: { names: 'baseUrl', renamed: 'Beta.baseUrl' } } })
  })

  it('lets an environment exported with them win for every collection, as in Postman', () => {
    const staging = importPostman({
      name: 'Staging',
      values: [{ key: 'baseUrl', value: 'https://staging.test', enabled: true }],
      _postman_variable_scope: 'environment'
    })
    const merged = merge(
      ['alpha', postman('Alpha', { baseUrl: 'https://alpha.test' })],
      ['beta', postman('Beta', { baseUrl: 'https://beta.test' })],
      ['staging', staging]
    )
    const selected = env(merged, 'Staging')
    expect(sentTo(merged, 'Ping Alpha', selected)).toBe('https://staging.test/ping')
    expect(sentTo(merged, 'Ping Beta', selected)).toBe('https://staging.test/ping')
  })

  it('shares a variable both collections give the same value, and renames one with no value yet', () => {
    const merged = merge(
      ['alpha', postman('Alpha', { baseUrl: 'https://api.test', token: '' })],
      [
        'beta',
        postman(
          'Beta',
          { baseUrl: 'https://api.test', token: '' },
          {
            event: [{ listen: 'test', script: { exec: ["pm.environment.set('token', pm.response.json().token)"] } }]
          }
        )
      ]
    )
    expect(find(merged, 'Ping Beta').url).toBe('{{baseUrl}}/ping')
    // A credential to fill in is never shared between two APIs; Beta's own script sets Beta's.
    expect(find(merged, 'Ping Beta').postScript).toBe("pm.environment.set('Beta.token', pm.response.json().token)")
    expect(merged.environments![0].variables.map((v) => v.name).sort()).toEqual(['Beta.token', 'baseUrl', 'token'])
  })

  it('keeps each collection on its own server whichever environment is selected', () => {
    const api = (name: string, servers: TigerEnvironment[]): ImportResult => ({
      name,
      source: 'openapi',
      requests: [
        {
          path: [],
          request: { name: `List ${name}`, method: 'get', url: '{{baseUrl}}/items', headers: [], query: [], body: { type: 'none', content: '' } }
        }
      ],
      environments: servers,
      auth: { type: 'bearer', token: '{{token}}' }
    })
    const vars = (baseUrl: string) => [
      { name: 'baseUrl', value: baseUrl, enabled: true },
      { name: 'token', value: '', enabled: true }
    ]
    const merged = merge(
      ['orders', api('Orders', [
        { name: 'Production', variables: vars('https://orders.example') },
        { name: 'Sandbox', variables: vars('https://sandbox.orders.example') }
      ])],
      ['billing', api('Billing', [{ name: 'Test', variables: vars('https://test.billing.example') }])]
    )
    expect(sentTo(merged, 'List Orders', env(merged, 'Sandbox'))).toBe('https://sandbox.orders.example/items')
    expect(sentTo(merged, 'List Billing', env(merged, 'Sandbox'))).toBe('https://test.billing.example/items')
    expect(sentTo(merged, 'List Billing', env(merged, 'Test'))).toBe('https://test.billing.example/items')
    // Never production by surprise: another collection's environment falls back to its sandbox.
    expect(sentTo(merged, 'List Orders', env(merged, 'Test'))).toBe('https://sandbox.orders.example/items')
    // The collection auth of the second one follows its renamed token.
    expect(merged.folders).toContainEqual({ path: ['billing'], auth: { type: 'bearer', token: '{{Billing.token}}' } })
  })

  it('works the same for two collection files dropped together', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tiger-two-'))
    const file = (name: string, host: string) =>
      writeFile(
        join(dir, `${name}.postman_collection.json`),
        JSON.stringify({
          info: { name, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
          item: [{ name: `Ping ${name}`, request: { method: 'GET', url: '{{baseUrl}}/ping' } }],
          variable: [{ key: 'baseUrl', value: host }]
        })
      )
    await file('Alpha', 'https://alpha.test')
    await file('Beta', 'https://beta.test')
    const result = layerCollectionVariables((await importPaths([dir]))!)
    const selected = result.environments![0]
    expect(sentTo(result, 'Ping Alpha', selected)).toBe('https://alpha.test/ping')
    expect(sentTo(result, 'Ping Beta', selected)).toBe('https://beta.test/ping')
  })
})
