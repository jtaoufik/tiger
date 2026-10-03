import { describe, expect, it } from 'vitest'
import { detectFormat, importCurl, importOpenApi, summarizeImport } from '../../src/core/import'
import { applyPathVariables } from '../../src/core/import/common'
import { envToVars, findMissingVars, findUnknownDynamicVars, interpolate } from '../../src/core/interpolate'

describe('detectFormat', () => {
  it('recognizes each tool from its content', () => {
    expect(detectFormat('a.json', { info: { schema: 'https://schema.getpostman.com/json/collection/v2.1.0/' }, item: [] })).toBe('postman')
    expect(detectFormat('env.json', { name: 'dev', values: [], _postman_variable_scope: 'environment' })).toBe('postman')
    expect(detectFormat('i.json', { _type: 'export', __export_format: 4, resources: [] })).toBe('insomnia')
    expect(detectFormat('i.yaml', { type: 'collection.insomnia.rest/5.0', collection: [] })).toBe('insomnia')
    expect(detectFormat('o.yaml', { openapi: '3.1.0', paths: {} })).toBe('openapi')
    expect(detectFormat('s.json', { swagger: '2.0', paths: {} })).toBe('openapi')
    expect(detectFormat('svc.wsdl', undefined)).toBe('wsdl')
    expect(detectFormat('svc.xml', undefined, '<wsdl:definitions xmlns:wsdl="x">')).toBe('wsdl')
  })

  it('returns null for anything else', () => {
    expect(detectFormat('package.json', { name: 'x', version: '1' })).toBeNull()
    expect(detectFormat('pom.xml', undefined, '<project/>')).toBeNull()
    expect(detectFormat('x.json', null)).toBeNull()
  })
})

describe('summarizeImport', () => {
  it('counts folders including ancestors and groups warnings per request', () => {
    const summary = summarizeImport({
      name: 'C',
      source: 'postman',
      requests: [
        { path: ['A', 'B'], request: { name: 'r1', method: 'get', url: '', headers: [], query: [], body: { type: 'none', content: '' } } },
        { path: ['A'], request: { name: 'r2', method: 'get', url: '', headers: [], query: [], body: { type: 'none', content: '' } } },
        { path: [], request: { name: 'r3', method: 'get', url: '', headers: [], query: [], body: { type: 'none', content: '' } } }
      ],
      environments: [{ name: 'dev', variables: [] }],
      warnings: [
        { request: 'r1', path: ['A', 'B'], message: 'one' },
        { request: 'r1', path: ['A', 'B'], message: 'two' },
        { request: 'r1', path: ['A', 'B'], message: 'two' },
        { message: 'general' }
      ]
    })
    expect(summary).toEqual({
      name: 'C',
      requests: 3,
      folders: 2,
      environments: 1,
      items: [
        { request: 'r1', path: ['A', 'B'], messages: ['one', 'two'] },
        { request: undefined, path: [], messages: ['general'] }
      ]
    })
  })
})

describe('Postman and Bruno dynamic variables', () => {
  it('resolves $guid, $randomUUID, $randomBoolean and $randomAlphaNumeric', () => {
    expect(interpolate('{{$guid}}', {})).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(interpolate('{{$randomUUID}}', {})).toMatch(/^[0-9a-f-]{36}$/)
    expect(interpolate('{{$randomBoolean}}', {})).toMatch(/^(true|false)$/)
    expect(interpolate('{{$randomAlphaNumeric}}', {})).toMatch(/^[a-z0-9]$/)
    expect(interpolate('{{$guid}}', {})).not.toBe(interpolate('{{$guid}}', {}))
  })

  it('lists the dynamic variables Tiger cannot generate', () => {
    expect(findUnknownDynamicVars('{{$guid}} {{$randomFirstName}} {{$randomEmail}} {{$randomFirstName}} {{x}}')).toEqual([
      '$randomFirstName',
      '$randomEmail'
    ])
    expect(findMissingVars('{{$randomFirstName}}', {})).toEqual([])
  })
})

describe('applyPathVariables', () => {
  it('substitutes values, turns empty ones into {{vars}}, and leaves ports alone', () => {
    expect(
      applyPathVariables('http://localhost:8080/users/:id/posts/:postId', [
        { name: 'id', value: '42' },
        { name: 'postId', value: '' }
      ])
    ).toEqual({ url: 'http://localhost:8080/users/42/posts/{{postId}}', missing: ['postId'] })
    expect(applyPathVariables('{{base}}/v1/items:batchGet', [])).toEqual({
      url: '{{base}}/v1/items:batchGet',
      missing: []
    })
  })
})

describe('OpenAPI real-world shapes', () => {
  const spec = {
    openapi: '3.0.3',
    info: { title: 'Pets', description: 'Pet store' },
    servers: [{ url: 'https://{region}.pets.example.com/v1/', variables: { region: { default: 'eu' } } }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' }, key: { type: 'apiKey', in: 'query', name: 'k' } },
      parameters: { PetId: { name: 'petId', in: 'path', required: true, schema: { type: 'integer', example: 7 } } },
      schemas: {
        Pet: { type: 'object', properties: { name: { type: 'string', example: 'Rex' }, age: { type: 'integer' } } }
      },
      requestBodies: {
        PetBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } }
      }
    },
    paths: {
      '/pets/{petId}': {
        parameters: [{ $ref: '#/components/parameters/PetId' }, { name: 'trace', in: 'header', schema: { type: 'string' } }],
        put: {
          summary: 'Update pet',
          description: 'Replaces a pet.',
          requestBody: { $ref: '#/components/requestBodies/PetBody' }
        },
        get: { operationId: 'getPet', security: [{ key: [] }] }
      },
      '/pets/{petId}/photo': {
        post: {
          summary: 'Upload photo',
          parameters: [{ name: 'petId', in: 'path', required: true }],
          requestBody: {
            content: {
              'multipart/form-data': {
                schema: { type: 'object', properties: { caption: { type: 'string' }, file: { type: 'string', format: 'binary' } } }
              }
            }
          }
        }
      },
      '/health': { get: { summary: 'Health', security: [{}] } }
    }
  }
  const result = importOpenApi(spec)
  const byName = (n: string) => result.requests.find((r) => r.request.name === n)!.request

  it('resolves server variables, path templates and $ref parameters', () => {
    const vars = envToVars(result.environments?.[0])
    expect(interpolate(byName('Update pet').url, vars)).toBe('https://eu.pets.example.com/v1/pets/7')
    expect(interpolate(byName('Upload photo').url, vars)).toBe('https://eu.pets.example.com/v1/pets/{{petId}}/photo')
    expect(byName('Update pet').headers).toEqual([{ name: 'trace', value: '', enabled: false }])
    expect(byName('Update pet').docs).toBe('Replaces a pet.')
  })

  it('builds bodies from $ref schemas and multipart schemas', () => {
    expect(JSON.parse(byName('Update pet').body.content)).toEqual({ name: 'Rex', age: 0 })
    expect(byName('Upload photo').body).toEqual({ type: 'multipart', content: 'caption: \nfile: @file:' })
  })

  it('maps security schemes to collection and request auth', () => {
    expect(result.auth).toEqual({ type: 'bearer', token: '{{token}}' })
    expect(byName('getPet').auth).toEqual({ type: 'apikey', key: 'k', value: '{{apiKey}}', in: 'query' })
    expect(byName('Health').auth).toEqual({ type: 'none' })
    expect(result.warnings?.some((w) => /placeholder variables/.test(w.message))).toBe(true)
  })

  it('reads a Swagger 2 body parameter', () => {
    const swagger = importOpenApi({
      swagger: '2.0',
      host: 'api.test',
      basePath: '/v2',
      paths: {
        '/pets': {
          post: {
            summary: 'Add',
            parameters: [{ in: 'body', name: 'body', schema: { type: 'object', properties: { name: { type: 'string', example: 'Tom' } } } }]
          }
        }
      }
    })
    expect(interpolate(swagger.requests[0].request.url, envToVars(swagger.environments?.[0]))).toBe(
      'https://api.test/v2/pets'
    )
    expect(JSON.parse(swagger.requests[0].request.body.content)).toEqual({ name: 'Tom' })
  })
})

describe('curl import additions', () => {
  it('maps -F fields and files to a multipart body', () => {
    const r = importCurl(`curl https://x.test/upload -F 'caption=hi' -F 'file=@/tmp/a.png;type=image/png'`)!
    expect(r.method).toBe('post')
    expect(r.body).toEqual({ type: 'multipart', content: 'caption: hi\nfile: @file:/tmp/a.png' })
  })

  it('maps --json, -b cookies, -A and -G', () => {
    const json = importCurl(`curl --json '{"a":1}' https://x.test`)!
    expect(json.body).toEqual({ type: 'json', content: '{"a":1}' })
    const cookie = importCurl(`curl -b 'sid=1; theme=dark' -A 'Bot/1' https://x.test`)!
    expect(cookie.headers).toEqual([
      { name: 'Cookie', value: 'sid=1; theme=dark', enabled: true },
      { name: 'User-Agent', value: 'Bot/1', enabled: true }
    ])
    const get = importCurl(`curl -G https://x.test/search -d q=lamp -d page=2`)!
    expect(get.method).toBe('get')
    expect(get.url).toBe('https://x.test/search?q=lamp&page=2')
  })
})
