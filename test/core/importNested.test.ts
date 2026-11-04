import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import { importInsomnia, importOpenApi, importPostman, summarizeImport, type ImportResult } from '../../src/core/import'
import { folderPaths } from '../../src/core/import/common'
import { nearestFolderAuth } from '../../src/core/collectionSettings'

const fixtures = join(__dirname, 'fixtures/nested')
const json = (name: string) => JSON.parse(readFileSync(join(fixtures, name), 'utf8'))
const yaml = (name: string) => parseYaml(readFileSync(join(fixtures, name), 'utf8'))

/** Every request as "folder/path: name", in import order. */
const placed = (result: ImportResult) => result.requests.map((r) => `${r.path.join('/')}: ${r.request.name}`)
const find = (result: ImportResult, path: string, name: string) => {
  const found = result.requests.find((r) => r.path.join('/') === path && r.request.name === name)
  if (!found) throw new Error(`no request ${name} under ${path}`)
  return found.request
}
const folderAuthOf = (result: ImportResult, path: string[]) =>
  nearestFolderAuth(path, (p) => result.folders?.find((f) => f.path.join('/') === p.join('/'))?.auth)

describe('Postman: folders nested four levels deep', () => {
  const result = importPostman(json('deep.postman_collection.json'))

  it('keeps every request under its full folder path, in the order Postman shows', () => {
    expect(placed(result)).toEqual([
      ': Health',
      'Store/Catalog/Products: List',
      'Store/Catalog/Products/Reviews: List',
      'Store/Catalog/Products/Reviews: Create',
      'Store/Catalog/Reviews: Moderation queue',
      'Store/Admin: Stats',
      'Warehouse/Admin: Stats',
      'Warehouse/Admin: 2024',
      'Warehouse/Admin 2: Purge'
    ])
  })

  it('tells folders apart by their whole path: same names at other depths or under other parents keep their name', () => {
    // "Reviews" twice at different depths, "Admin" under two parents: no rename.
    const renamed = (result.warnings ?? []).filter((w) => w.i18n?.key === 'imports.folderRenamed')
    expect(renamed.map((w) => [w.path, w.request])).toEqual([[['Warehouse'], 'Admin 2']])
  })

  it('gives each folder its own auth, inherited by the requests below it', () => {
    expect(result.folders?.map((f) => f.path.join('/'))).toEqual([
      'Store',
      'Store/Catalog',
      'Store/Admin',
      'Warehouse/Admin'
    ])
    expect(folderAuthOf(result, ['Store', 'Catalog', 'Products', 'Reviews'])).toEqual({
      type: 'basic',
      username: 'catalog-bot',
      password: '{{pass}}'
    })
    expect(folderAuthOf(result, ['Store', 'Admin'])).toMatchObject({ username: 'store-admin' })
    expect(folderAuthOf(result, ['Warehouse', 'Admin'])).toMatchObject({ username: 'warehouse-admin' })
    // The second Warehouse > Admin has no auth of its own and must not get its sibling's.
    expect(folderAuthOf(result, ['Warehouse', 'Admin 2'])).toBeUndefined()
  })

  it('reports folder variables (Tiger has no folder scope) instead of dropping them quietly', () => {
    const note = result.warnings?.find((w) => w.i18n?.key === 'imports.folderVariables')
    expect(note).toMatchObject({ request: 'Catalog', path: ['Store'], i18n: { vars: { names: 'pageSize' } } })
  })

  it('maps a path built from parts, including {type, value} segments and a numeric name', () => {
    expect(find(result, 'Store/Catalog/Products/Reviews', 'List').url).toBe('{{baseUrl}}/products/42/reviews')
    expect(find(result, 'Warehouse/Admin', '2024').url).toBe('{{baseUrl}}/reports/2024')
    // A raw body with no options.raw.language follows the Content-Type header.
    expect(find(result, 'Store/Catalog/Products/Reviews', 'Create').body).toEqual({ type: 'json', content: '{"stars": 5}' })
  })

  it('counts requests and folders the way the sidebar will show them', () => {
    const summary = summarizeImport(result)
    expect(summary.requests).toBe(9)
    expect(summary.folders).toBe(9)
    expect(folderPaths(result.requests).map((p) => p.join('/'))).toEqual([
      'Store',
      'Store/Catalog',
      'Store/Catalog/Products',
      'Store/Catalog/Products/Reviews',
      'Store/Catalog/Reviews',
      'Store/Admin',
      'Warehouse',
      'Warehouse/Admin',
      'Warehouse/Admin 2'
    ])
  })
})

describe('Insomnia: request groups nested three levels, listed child before parent', () => {
  const v4 = importInsomnia(json('deep-v4.insomnia.json'))
  const v5 = importInsomnia(yaml('deep-v5.insomnia.yaml'))

  it('rebuilds the chain from the ids whatever the order in the export (v4)', () => {
    expect(v4.name).toBe('Deep Insomnia')
    expect(placed(v4)).toEqual([
      ': Ping',
      'Users: Me',
      'Users/Admin/Audit: List audit events',
      'Billing/Audit: List audit events'
    ])
  })

  it('maps the v5 nested tree the same way', () => {
    expect(placed(v5)).toEqual([': Ping', 'Users: Me', 'Users/Admin/Audit: List audit events'])
  })

  it('keeps folder auth on the nested group, and reports its folder variables', () => {
    for (const result of [v4, v5]) {
      expect(result.folders).toEqual([
        { path: ['Users', 'Admin'], auth: { type: 'basic', username: 'root', password: '{{rootPassword}}' } }
      ])
      expect(folderAuthOf(result, ['Users', 'Admin', 'Audit'])?.type).toBe('basic')
    }
    expect(v4.warnings?.find((w) => w.i18n?.key === 'imports.folderVariables')).toMatchObject({
      request: 'Admin',
      path: ['Users'],
      i18n: { vars: { names: 'adminHost' } }
    })
  })

  it('counts the nested folders', () => {
    expect(summarizeImport(v4)).toMatchObject({ requests: 4, folders: 5, environments: 1 })
    expect(summarizeImport(v5)).toMatchObject({ requests: 3, folders: 3, environments: 1 })
  })
})

describe('OpenAPI: tags become folders', () => {
  const openapi = importOpenApi({
    openapi: '3.0.3',
    info: { title: 'Tagged' },
    servers: [{ url: 'https://api.test' }],
    paths: {
      '/store/catalog/products': { get: { summary: 'List products', tags: ['Store/Catalog'] } },
      '/store/catalog/products/{id}': {
        get: { summary: 'Get product', tags: ['Store/Catalog'], parameters: [{ name: 'id', in: 'path', required: true, example: '7' }] }
      },
      '/admin/stats': { get: { summary: 'Stats', tags: ['Admin'] } },
      '/health': { get: { summary: 'Health' } }
    }
  })
  const swagger = importOpenApi({
    swagger: '2.0',
    info: { title: 'Legacy' },
    host: 'legacy.test',
    basePath: '/v1',
    paths: {
      '/users/{id}': { get: { summary: 'Get user', tags: ['Users'], parameters: [{ name: 'id', in: 'path', required: true, type: 'string' }] } },
      '/orders/open': { get: { summary: 'Open orders' } }
    }
  })

  it('puts each operation under its first tag, one level deep (a slash in a tag is part of the name)', () => {
    expect(placed(openapi)).toEqual([
      'Store/Catalog: List products',
      'Store/Catalog: Get product',
      'Admin: Stats',
      'health: Health'
    ])
    expect(openapi.requests[0].path).toEqual(['Store/Catalog'])
    expect(summarizeImport(openapi)).toMatchObject({ requests: 4, folders: 3 })
  })

  it('reads a Swagger 2 document: tags, then the first path segment', () => {
    expect(placed(swagger)).toEqual(['Users: Get user', 'orders: Open orders'])
    expect(swagger.requests[0].request.url).toBe('{{baseUrl}}/users/{{id}}')
    expect(swagger.environments?.[0].variables[0]).toEqual({ name: 'baseUrl', value: 'https://legacy.test/v1', enabled: true })
  })
})
