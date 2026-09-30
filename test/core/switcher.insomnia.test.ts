import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'
import { importInsomnia, type ImportResult } from '../../src/core/import'
import { convertTemplates, flattenEnvData } from '../../src/core/import/insomnia'
import { runScript } from '../../src/core/script'
import { interpolate, envToVars } from '../../src/core/interpolate'

const dir = join(__dirname, 'fixtures/switcher/insomnia')
const v4 = importInsomnia(JSON.parse(readFileSync(join(dir, 'insomnia-v4.json'), 'utf8')))
const v5 = importInsomnia(parseYaml(readFileSync(join(dir, 'insomnia-v5.yaml'), 'utf8')))

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

describe('Insomnia templates and environments', () => {
  it('rewrites {{ _.x }} and maps uuid / now tags', () => {
    const tags = new Set<string>()
    expect(convertTemplates('{{ _.api.url }}/x/{{ _.id }}', tags)).toBe('{{api.url}}/x/{{id}}')
    expect(convertTemplates("{% uuid 'v4' %}", tags)).toBe('{{$uuid}}')
    expect(convertTemplates("{% now 'unix', '' %}", tags)).toBe('{{$timestamp}}')
    expect(convertTemplates("{% now 'iso-8601', '' %}", tags)).toBe('{{$isoTimestamp}}')
    expect(tags.size).toBe(0)
    expect(convertTemplates("{% base64 'encode', 'x' %}", tags)).toBe("{% base64 'encode', 'x' %}")
    expect([...tags]).toEqual(['base64'])
  })

  it('flattens nested environment JSON into dotted names', () => {
    expect(flattenEnvData({ api: { url: 'u', version: 2 }, tags: ['a'], on: true })).toEqual([
      { name: 'api.url', value: 'u', enabled: true },
      { name: 'api.version', value: '2', enabled: true },
      { name: 'tags', value: '["a"]', enabled: true },
      { name: 'on', value: 'true', enabled: true }
    ])
  })
})

describe('Insomnia v4 real-world export', () => {
  it('uses the workspace name and rebuilds the folder tree', () => {
    expect(v4.name).toBe('Shop (Insomnia)')
    expect(req(v4, 'Get my profile').path).toEqual(['Auth', 'Account'])
    expect(req(v4, 'List orders').path).toEqual([])
  })

  it('merges each sub environment over the base environment', () => {
    expect(v4.environments?.map((e) => e.name)).toEqual(['Development', 'Production'])
    const dev = envToVars(v4.environments![0])
    expect(dev['api.url']).toBe('http://localhost:8080/api')
    expect(dev['api.version']).toBe('2')
    expect(dev['user.email']).toBe('ada@example.com')
    expect(dev.apiKey).toBe('dev-key')
    // The imported URL resolves against the flattened environment.
    expect(interpolate(req(v4, 'Log in').request.url, dev)).toBe('http://localhost:8080/api/auth/login')
    expect(v4.warnings?.some((w) => /prompt/.test(w.message))).toBe(true)
  })

  it('converts template syntax in URL, body, headers and path parameters', () => {
    const login = req(v4, 'Log in').request
    expect(login.url).toBe('{{api.url}}/auth/login')
    expect(login.body.content).toContain('"email": "{{user.email}}"')
    expect(login.docs).toBe('Returns a session token.')
    const me = req(v4, 'Get my profile').request
    expect(me.url).toBe('{{api.url}}/users/{{user.id}}')
    expect(me.query).toEqual([
      { name: 'fields', value: 'name,email', enabled: true },
      { name: 'trace', value: '{{$uuid}}', enabled: false }
    ])
    expect(me.headers[0]).toEqual({ name: 'X-Request-Time', value: '{{$timestamp}}', enabled: true })
    expect(notes(v4, 'Get my profile')).toMatch(/template tags Tiger cannot run: response/)
  })

  it('maps request, folder and inherited auth', () => {
    expect(req(v4, 'Log in').request.auth).toEqual({ type: 'none' })
    expect(req(v4, 'Get my profile').request.auth).toBeUndefined()
    expect(v4.folders).toContainEqual({
      path: ['Auth', 'Account'],
      auth: { type: 'bearer', token: '{{sessionToken}}' },
      docs: 'Needs a session.'
    })
    expect(req(v4, 'Upload avatar').request.auth).toEqual({
      type: 'apikey',
      key: 'X-Api-Key',
      value: '{{apiKey}}',
      in: 'header'
    })
    expect(req(v4, 'List orders').request.auth).toEqual({
      type: 'oauth2',
      grantType: 'client_credentials',
      tokenUrl: '{{api.url}}/oauth/token',
      clientId: '{{oauth.clientId}}',
      clientSecret: '{{oauth.clientSecret}}',
      scope: 'orders:read'
    })
    expect(req(v4, 'Catalogue (GraphQL)').request.auth).toEqual({ type: 'none' })
    expect(notes(v4, 'Catalogue (GraphQL)')).toMatch(/Digest auth is not supported/)
    expect(notes(v4, 'Subscribe')).toMatch(/prefix "Token"/)
  })

  it('maps multipart with files, urlencoded and GraphQL bodies', () => {
    expect(req(v4, 'Upload avatar').request.body).toEqual({
      type: 'multipart',
      content: 'caption: me at the beach\nfile: @file:/Users/ada/Pictures/avatar.jpg\n~private: true'
    })
    expect(notes(v4, 'Upload avatar')).toMatch(/avatar\.jpg/)
    expect(req(v4, 'Subscribe').request.body).toEqual({
      type: 'form',
      content: 'email: {{user.email}}\n~promo: yes'
    })
    expect(req(v4, 'Catalogue (GraphQL)').request.body).toEqual({
      type: 'graphql',
      content: 'query { products { id } }',
      variables: '{"first":5}'
    })
  })

  it('copies folder scripts into requests and flags folder variables and gRPC', () => {
    const me = req(v4, 'Get my profile').request
    expect(me.preScript).toBe("insomnia.request.headers.add({ key: 'X-Client', value: 'tiger-import' });")
    expect(notes(v4, 'Account')).toMatch(/Folder variables are not supported: pageSize/)
    expect(v4.warnings?.some((w) => /1 gRPC request was skipped/.test(w.message))).toBe(true)
  })

  it('runs an imported insomnia.* after-response script', () => {
    const login = req(v4, 'Log in').request
    const result = runScript(login.postScript!, {
      vars: {},
      response: { status: 200, headers: [], body: '{"token":"t-1"}', timeMs: 5 }
    })
    expect(result.tests).toEqual([{ name: 'logged in', passed: true }])
    expect(result.vars.sessionToken).toBe('t-1')
  })
})

describe('Insomnia v5 YAML collection', () => {
  it('reads the nested collection tree', () => {
    expect(v5.name).toBe('Weather (Insomnia 11)')
    expect(req(v5, 'City forecast').path).toEqual(['Forecast'])
    expect(req(v5, 'Post alert').path).toEqual([])
  })

  it('maps URL, path parameters, query, body, scripts and folder auth', () => {
    const city = req(v5, 'City forecast').request
    expect(city.url).toBe('{{base}}/forecast/Paris')
    expect(city.query).toEqual([{ name: 'units', value: 'metric', enabled: true }])
    expect(city.postScript).toContain("insomnia.test('ok'")
    expect(v5.folders).toEqual([
      { path: ['Forecast'], auth: { type: 'apikey', key: 'appid', value: '{{owmKey}}', in: 'query' } }
    ])
    expect(req(v5, 'Post alert').request.body).toEqual({ type: 'json', content: '{\n  "level": "red"\n}' })
  })

  it('merges sub environments over the base', () => {
    expect(v5.environments).toEqual([
      {
        name: 'Staging',
        variables: [
          { name: 'owmKey', value: 'base-key', enabled: true },
          { name: 'base', value: 'https://staging.weather.example.com', enabled: true }
        ]
      }
    ])
  })
})
