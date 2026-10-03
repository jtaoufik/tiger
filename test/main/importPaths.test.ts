import { join } from 'node:path'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  dialog: {}
}))

import { importPaths, readBrunoFolder } from '../../src/main/importers'
import { runScript } from '../../src/core/script'
import { nearestFolderAuth } from '../../src/core/collectionSettings'
import { layerCollectionVariables, type ImportResult } from '../../src/core/import'

const fixtures = join(__dirname, '../core/fixtures/switcher')
const req = (result: ImportResult, name: string) => {
  const found = result.requests.find((r) => r.request.name === name)
  if (!found) throw new Error(`no request ${name}`)
  return found
}
const notes = (result: ImportResult, name: string) =>
  (result.warnings ?? [])
    .filter((w) => w.request === name)
    .map((w) => w.message)
    .join(' ')

describe('Bruno collection folder', () => {
  it('reads the name from bruno.json and folder names from folder.bru', async () => {
    const result = await readBrunoFolder(join(fixtures, 'bruno-shop'))
    expect(result.name).toBe('Bruno Shop')
    expect(result.source).toBe('bruno')
    expect(req(result, 'Get user').path).toEqual(['User management'])
    expect(req(result, 'Delete user').path).toEqual(['User management', 'admin'])
    expect(result.requests).toHaveLength(5)
  })

  it('maps collection.bru and folder.bru auth and docs, and request auth modes', async () => {
    const result = await readBrunoFolder(join(fixtures, 'bruno-shop'))
    expect(result.auth).toEqual({ type: 'bearer', token: '{{token}}' })
    expect(result.docs).toBe('# Bruno Shop\nCollection docs in markdown.')
    expect(result.folders).toEqual([
      { path: ['User management'], auth: { type: 'basic', username: 'admin', password: '{{adminPassword}}' } }
    ])
    expect(req(result, 'Get user').request.auth).toBeUndefined() // inherit
    expect(req(result, 'Health').request.auth).toEqual({ type: 'none' })
    expect(req(result, 'Upload avatar').request.auth).toEqual({
      type: 'apikey',
      key: 'X-Api-Key',
      value: '{{apiKey}}',
      in: 'query'
    })
    // Unsupported mode: explicit none plus a note.
    expect(req(result, 'Delete user').request.auth).toEqual({ type: 'none' })
    expect(notes(result, 'Delete user')).toMatch(/AWS Signature v4 auth is not supported/)
    // A request two folders deep inherits the folder auth.
    const lookup = (p: string[]) => result.folders?.find((f) => f.path.join('/') === p.join('/'))?.auth
    expect(nearestFolderAuth(req(result, 'Delete user').path, lookup)?.type).toBe('basic')
  })

  it('copies collection and folder headers into requests; the closest one wins', async () => {
    const result = await readBrunoFolder(join(fixtures, 'bruno-shop'))
    expect(req(result, 'Get user').request.headers).toEqual([
      { name: 'X-Client', value: 'bruno-import', enabled: true },
      { name: 'Accept', value: 'application/vnd.shop.v2+json', enabled: true },
      { name: 'X-Trace', value: '{{$guid}}', enabled: true }
    ])
    expect(notes(result, 'The collection')).toMatch(/headers and scripts/)
  })

  it('maps params:query, params:path, multipart files and graphql', async () => {
    const result = await readBrunoFolder(join(fixtures, 'bruno-shop'))
    const get = req(result, 'Get user').request
    expect(get.url).toBe('{{baseUrl}}/users/{{userId}}/orders/{{orderId}}')
    expect(get.query).toEqual([
      { name: 'expand', value: 'profile', enabled: true },
      { name: 'debug', value: '1', enabled: false }
    ])
    expect(notes(result, 'Get user')).toMatch(/:orderId/)
    expect(notes(result, 'Get user')).toMatch(/Request variables \(pre-request\) are not supported: localOnly/)
    expect(get.docs).toBe('Fetches one user.')
    expect(req(result, 'Upload avatar').request.body).toEqual({
      type: 'multipart',
      content: 'caption: holiday\nfile: @file:/Users/ada/Pictures/avatar.png\n~draft: true'
    })
    expect(req(result, 'Search').request.body).toEqual({
      type: 'graphql',
      content: 'query {\n  search(q: "lamp") { id }\n}',
      variables: '{"q": "lamp"}'
    })
  })

  it('keeps scripts and tests, converts assertions, and they run', async () => {
    const result = await readBrunoFolder(join(fixtures, 'bruno-shop'))
    const get = req(result, 'Get user').request
    expect(get.preScript).toBe('bru.setVar("startedAt", Date.now());')
    const run = runScript(get.postScript!, {
      vars: {},
      response: { status: 200, headers: [], body: '{"id":"u-7"}', timeMs: 3 }
    })
    expect(run.error).toBeUndefined()
    expect(run.tests).toEqual([{ name: 'returns the user', passed: true }])
    expect(run.vars.lastUserId).toBe('u-7')

    const health = req(result, 'Health').request
    const checked = runScript(health.postScript!, {
      vars: {},
      response: { status: 503, headers: [], body: '{"ok":true}', timeMs: 3 }
    })
    expect(checked.tests.map((t) => [t.name, t.passed])).toEqual([
      ['res.status: eq 200', false],
      ['res.body.ok: isTruthy', true]
    ])
    expect(notes(result, 'Health')).toMatch(/between 1, 3/)
    expect(notes(result, 'Delete user')).toMatch(/bru\.runRequest \/ sendRequest/)
  })

  it('imports environments with the collection vars layered in, and flags secrets', async () => {
    const result = layerCollectionVariables(await readBrunoFolder(join(fixtures, 'bruno-shop')))
    expect(result.environments?.map((e) => e.name).sort()).toEqual(['Local', 'Production'])
    const local = result.environments!.find((e) => e.name === 'Local')!
    expect(local.variables).toEqual([
      { name: 'apiVersion', value: 'v2', enabled: true },
      { name: 'baseUrl', value: 'http://localhost:3000', enabled: true },
      { name: 'verbose', value: 'true', enabled: false }
    ])
    expect(notes(result, 'Local')).toMatch(/token, adminPassword/)
  })
})

describe('importPaths (drag and drop)', () => {
  it('detects a Bruno folder', async () => {
    const result = await importPaths([join(fixtures, 'bruno-shop')])
    expect(result?.source).toBe('bruno')
    expect(result?.requests).toHaveLength(5)
  })

  it('keeps one collection at the root when dropped with its environment files', async () => {
    const dir = join(fixtures, 'postman')
    const result = await importPaths([
      join(dir, 'shop.postman_collection.json'),
      join(dir, 'staging.postman_environment.json'),
      join(dir, 'workspace.postman_globals.json')
    ])
    expect(result?.name).toBe('Shop API')
    expect(result?.auth?.type).toBe('bearer')
    expect(req(result!, 'List products').path).toEqual(['Products'])
    // Globals are not a second environment: with only one active at a time,
    // they would never resolve together with Staging.
    expect(result?.environments?.map((e) => e.name)).toEqual(['Staging'])
    // Collection variables and globals are both layered into Staging.
    const layered = layerCollectionVariables(result!)
    const staging = layered.environments![0]
    expect(staging.variables.find((v) => v.name === 'pageSize')?.value).toBe('20')
    expect(staging.variables.find((v) => v.name === 'tenant')?.value).toBe('acme')
  })

  it('detects Insomnia JSON and YAML exports in a dropped folder, nesting each file', async () => {
    const result = await importPaths([join(fixtures, 'insomnia')])
    expect(result?.requests.length).toBe(8)
    expect(req(result!, 'City forecast').path).toEqual(['insomnia-v5', 'Forecast'])
    // Collection-level settings of each file become that folder's settings.
    expect(result?.folders).toContainEqual({
      path: ['insomnia-v5', 'Forecast'],
      auth: { type: 'apikey', key: 'appid', value: '{{owmKey}}', in: 'query' }
    })
  })

  it('reports files it cannot read instead of dropping them silently', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tiger-drop-'))
    await writeFile(join(dir, 'notes.json'), '{"hello": "world"}')
    await writeFile(join(dir, 'broken.json'), '{ nope')
    await expect(importPaths([join(dir, 'notes.json')])).rejects.toThrow(/not a Postman/)
    const mixed = await importPaths([
      join(dir, 'broken.json'),
      join(fixtures, 'postman', 'legacy-v20.postman_collection.json')
    ])
    expect(mixed?.name).toBe('Legacy v2.0')
    expect(mixed?.warnings?.some((w) => w.request === 'broken.json')).toBe(true)
  })
})
