import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  importPostman,
  layerCollectionVariables,
  summarizeImport,
  type ImportResult
} from '../../src/core/import'
import { nearestFolderAuth } from '../../src/core/collectionSettings'
import { runScript } from '../../src/core/script'
import { buildRequest } from '../../src/core/request'

const dir = join(__dirname, 'fixtures/switcher/postman')
const load = (name: string): unknown => JSON.parse(readFileSync(join(dir, name), 'utf8'))

const shop = importPostman(load('shop.postman_collection.json'))
const req = (result: ImportResult, name: string) => {
  const found = result.requests.find((r) => r.request.name === name)
  if (!found) throw new Error(`no request ${name}`)
  return found
}
const warningsFor = (result: ImportResult, name: string) =>
  (result.warnings ?? []).filter((w) => w.request === name).map((w) => w.message)

describe('Postman v2.1 real-world export', () => {
  it('keeps the collection name, docs and folder tree', () => {
    expect(shop.name).toBe('Shop API')
    expect(shop.docs).toBe('Everything the storefront calls.')
    expect(req(shop, 'Sales report').path).toEqual(['Admin', 'Reports'])
    expect(shop.requests).toHaveLength(12)
  })

  it('maps collection auth, folder auth and request auth', () => {
    expect(shop.auth).toEqual({ type: 'bearer', token: '{{accessToken}}' })
    expect(shop.folders).toContainEqual({
      path: ['Admin'],
      auth: { type: 'basic', username: 'admin', password: '{{adminPassword}}' }
    })
    expect(shop.folders).toContainEqual({ path: ['Products'], docs: 'Catalogue endpoints' })
    // No auth on the request = inherit (left unset).
    expect(req(shop, 'List products').request.auth).toBeUndefined()
    // noauth = explicit opt-out.
    expect(req(shop, 'Public health check').request.auth).toEqual({ type: 'none' })
    expect(req(shop, 'Pay with API key').request.auth).toEqual({
      type: 'apikey',
      key: 'api_key',
      value: '{{payKey}}',
      in: 'query'
    })
    expect(req(shop, 'Service token').request.auth).toEqual({
      type: 'oauth2',
      grantType: 'client_credentials',
      tokenUrl: 'https://auth.example.com/token',
      clientId: '{{clientId}}',
      clientSecret: '{{clientSecret}}',
      scope: 'orders:write'
    })
  })

  it('lets a request in a nested folder inherit its ancestor folder auth', () => {
    const sales = req(shop, 'Sales report')
    const lookup = (p: string[]) => shop.folders?.find((f) => f.path.join('/') === p.join('/'))?.auth
    expect(nearestFolderAuth(sales.path, lookup)).toEqual({
      type: 'basic',
      username: 'admin',
      password: '{{adminPassword}}'
    })
  })

  it('flags unsupported auth and imports a saved OAuth token as bearer', () => {
    expect(req(shop, 'Legacy SOAP ping').request.auth).toEqual({ type: 'none' })
    expect(warningsFor(shop, 'Legacy SOAP ping').join(' ')).toMatch(/Digest auth is not supported/)
    expect(req(shop, 'Refund (OAuth)').request.auth).toEqual({ type: 'bearer', token: 'eyJhbGciOi.saved' })
    expect(warningsFor(shop, 'Refund (OAuth)').join(' ')).toMatch(/authorization_code/)
  })

  it('keeps disabled headers and query params disabled', () => {
    const list = req(shop, 'List products').request
    expect(list.headers).toEqual([
      { name: 'Accept', value: 'application/json', enabled: true },
      { name: 'X-Debug', value: 'true', enabled: false }
    ])
    expect(list.url).toBe('{{baseUrl}}/products')
    expect(list.query).toEqual([
      { name: 'page', value: '1', enabled: true },
      { name: 'size', value: '{{pageSize}}', enabled: true },
      { name: 'sort', value: 'price', enabled: false }
    ])
    expect(list.docs).toBe('Paged product list.')
  })

  it('keeps the query string of a plain string URL', () => {
    expect(req(shop, 'Create order').request.url).toBe('{{baseUrl}}/orders')
    expect(req(shop, 'Create order').request.query).toEqual([
      { name: 'dryRun', value: 'false', enabled: true }
    ])
  })

  it('resolves :path variables into the URL and flags the ones without a value', () => {
    const get = req(shop, 'Get product')
    expect(get.request.url).toBe('{{baseUrl}}/products/{{firstProductId}}/variants/{{variantId}}')
    expect(warningsFor(shop, 'Get product').join(' ')).toMatch(/:variantId/)
  })

  it('maps form-data to multipart, keeping file rows and disabled rows', () => {
    const upload = req(shop, 'Upload product image').request
    expect(upload.body).toEqual({
      type: 'multipart',
      content: 'productId: 42\nimage: @file:/Users/ada/Pictures/lamp.png\nthumbnail: @file:\n~note: draft'
    })
    const notes = warningsFor(shop, 'Upload product image').join(' ')
    expect(notes).toMatch(/lamp\.png/)
    expect(notes).toMatch(/"thumbnail" is a file upload with no file/)
  })

  it('maps urlencoded, GraphQL, JSON and XML bodies', () => {
    expect(req(shop, 'Pay with API key').request.body).toEqual({
      type: 'form',
      content: 'amount: 1999\n~currency: EUR'
    })
    expect(req(shop, 'Search (GraphQL)').request.body).toEqual({
      type: 'graphql',
      content: 'query Search($q: String!) {\n  search(q: $q) { id name }\n}',
      variables: '{\n  "q": "lamp"\n}'
    })
    expect(req(shop, 'Create order').request.body.type).toBe('json')
    expect(req(shop, 'Legacy SOAP ping').request.body).toEqual({ type: 'xml', content: '<ping/>' })
  })

  it('flags a binary file body', () => {
    expect(req(shop, 'Upload invoice PDF').request.body.type).toBe('none')
    expect(warningsFor(shop, 'Upload invoice PDF').join(' ')).toMatch(/binary file/)
  })

  it('copies collection and folder scripts into each request, outermost first', () => {
    const sales = req(shop, 'Sales report').request
    expect(sales.preScript).toBe(
      'pm.variables.set("requestId", pm.variables.replaceIn("{{$guid}}"));\n\n' +
        "pm.request.headers.add({ key: 'X-Admin', value: 'yes' });"
    )
    const list = req(shop, 'List products').request
    expect(list.postScript?.startsWith('pm.test("Response time is acceptable"')).toBe(true)
    expect(list.postScript).toContain('pm.response.to.have.status(200)')
    expect(warningsFor(shop, 'The collection').join(' ')).toMatch(/copied into its 12 requests/)
    expect(warningsFor(shop, 'Folder "Admin"').join(' ')).toMatch(/copied into its 3 requests/)
  })

  it('flags pm.sendRequest and unknown dynamic variables, keeping the supported ones', () => {
    const notes = warningsFor(shop, 'Create order').join(' ')
    expect(notes).toMatch(/pm\.sendRequest/)
    expect(notes).toMatch(/\{\{\$randomFirstName\}\}/)
    expect(notes).not.toMatch(/\$guid|\$timestamp\b|\$randomInt/)
  })

  it('keeps collection variables, disabled ones disabled, for layering', () => {
    expect(shop.collectionVariables).toEqual([
      { name: 'baseUrl', value: 'https://shop.example.com/api', enabled: true },
      { name: 'pageSize', value: '20', enabled: true },
      { name: 'legacyFlag', value: '1', enabled: false }
    ])
  })

  it('turns collection variables into an environment when there is none', () => {
    const layered = layerCollectionVariables(shop)
    expect(layered.collectionVariables).toBeUndefined()
    expect(layered.environments).toEqual([
      { name: 'Shop API variables', variables: shop.collectionVariables }
    ])
    // Idempotent.
    expect(layerCollectionVariables(layered)).toBe(layered)
  })

  it('layers collection variables under each imported environment', () => {
    const staging = importPostman(load('staging.postman_environment.json')).environments![0]
    const layered = layerCollectionVariables({ ...shop, environments: [staging] })
    const vars = layered.environments![0].variables
    expect(vars.map((v) => v.name)).toEqual([
      'pageSize',
      'legacyFlag',
      'baseUrl',
      'accessToken',
      'adminPassword',
      'timeoutMs'
    ])
    // The environment value wins over the collection variable.
    expect(vars.find((v) => v.name === 'baseUrl')?.value).toBe('https://staging.shop.example.com/api')
    expect(layered.warnings?.some((w) => /one variable scope/.test(w.message))).toBe(true)
  })

  it('summarizes counts and groups warnings per request', () => {
    const summary = summarizeImport(layerCollectionVariables(shop))
    expect(summary).toMatchObject({ name: 'Shop API', requests: 12, folders: 4, environments: 1 })
    const create = summary.items.find((i) => i.request === 'Create order')!
    expect(create.path).toEqual(['Checkout'])
    expect(create.messages.length).toBe(2)
  })
})

describe('Postman imported scripts actually run', () => {
  it('runs the imported test script against a response', () => {
    const list = req(shop, 'List products').request
    const result = runScript(list.postScript!, {
      vars: {},
      response: {
        status: 200,
        headers: [{ name: 'Content-Type', value: 'application/json' }],
        body: '{"items":[{"id":"p1"}]}',
        timeMs: 120
      }
    })
    expect(result.error).toBeUndefined()
    expect(result.tests).toEqual([
      { name: 'Response time is acceptable', passed: true },
      { name: 'Status code is 200', passed: true },
      { name: 'Has items', passed: true }
    ])
    expect(result.vars.firstProductId).toBe('p1')
  })

  it('runs legacy tests[] and postman.setEnvironmentVariable', () => {
    const post = req(shop, 'Create order').request.postScript!
    const result = runScript(post, {
      vars: {},
      response: { status: 201, headers: [], body: '{"id":"o-9"}', timeMs: 10 }
    })
    expect(result.tests).toContainEqual({ name: 'Status code is 201', passed: true })
    expect(result.vars.orderId).toBe('o-9')
  })

  it('applies a folder pre-request header through pm.request.headers.add', () => {
    const sales = req(shop, 'Sales report').request
    const result = runScript(sales.preScript!, {
      vars: {},
      request: { method: 'get', url: sales.url, headers: sales.headers }
    })
    expect(result.error).toBeUndefined()
    expect(result.headerChanges).toEqual([{ name: 'X-Admin', value: 'yes' }])
    expect(result.vars.requestId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('reports pm.sendRequest clearly when the script runs', () => {
    const pre = req(shop, 'Create order').request.preScript!
    const result = runScript(pre, { vars: { baseUrl: 'https://x' } })
    expect(result.error).toBe('pm.sendRequest is not supported in Tiger yet')
    // Calls before it still took effect.
    expect(result.vars.orderRef).toMatch(/^ord-\d+$/)
  })

  it('sends the imported JSON body with dynamic variables resolved', () => {
    const create = req(shop, 'Create order').request
    const built = buildRequest(create, { baseUrl: 'https://x' })
    expect(built.body).toMatch(/"id": "[0-9a-f-]{36}"/)
    expect(built.body).toMatch(/"createdAt": \d+/)
    expect(built.body).toMatch(/"quantity": \d+/)
  })
})

describe('Postman v2.0 export', () => {
  const legacy = importPostman(load('legacy-v20.postman_collection.json'))

  it('reads v2.0 object-shaped auth', () => {
    expect(legacy.auth).toEqual({ type: 'apikey', key: 'X-API-Key', value: '{{apiKey}}', in: 'header' })
  })

  it('reads headers given as one string, with // disabling a line', () => {
    expect(req(legacy, 'Ping').request.headers).toEqual([
      { name: 'Accept', value: 'text/plain', enabled: true },
      { name: 'X-Old', value: '1', enabled: false }
    ])
    expect(req(legacy, 'Ping').request.query).toEqual([{ name: 'verbose', value: '1', enabled: true }])
    expect(req(legacy, 'Ping').request.docs).toBe('Checks the service is up.')
  })

  it('accepts a request given as a bare URL string', () => {
    expect(req(legacy, 'String request').request).toMatchObject({
      method: 'get',
      url: 'https://legacy.example.com/status'
    })
  })
})

describe('Postman environment and globals exports', () => {
  it('imports an environment with secrets and disabled values', () => {
    const result = importPostman(load('staging.postman_environment.json'))
    expect(result.requests).toEqual([])
    expect(result.environments).toEqual([
      {
        name: 'Staging',
        variables: [
          { name: 'baseUrl', value: 'https://staging.shop.example.com/api', enabled: true },
          { name: 'accessToken', value: '', enabled: true, secret: true },
          { name: 'adminPassword', value: 's3cret', enabled: true, secret: true },
          { name: 'timeoutMs', value: '3000', enabled: false }
        ]
      }
    ])
    expect(result.warnings?.[0].message).toMatch(/Secret values are not exported by Postman: accessToken/)
  })

  it('imports globals as an environment named Globals and says so', () => {
    const result = importPostman(load('workspace.postman_globals.json'))
    expect(result.environments?.[0]).toEqual({
      name: 'Globals',
      variables: [{ name: 'tenant', value: 'acme', enabled: true }]
    })
    expect(result.warnings?.[0].message).toMatch(/no global variables/)
  })

  it('points a v1 collection at the v2.1 export', () => {
    const result = importPostman({ name: 'Old', order: [], requests: [{ id: 'x' }] })
    expect(result.requests).toEqual([])
    expect(result.warnings?.[0].message).toMatch(/Collection v2\.1/)
  })
})
