import { describe, expect, it } from 'vitest'
import { importBrunoCollection, importBrunoRequest } from '../../src/core/import/bruno'
import { buildRequest } from '../../src/core/request'

/** A request file the way Bruno's editor saves it. */
const bru = (method: string, blocks: string) => `meta {
  name: Request
  type: http
  seq: 1
}

${method} {
${blocks}
`

describe('Bruno query params', () => {
  // Bruno keeps the URL bar and the Params table in sync, so the saved url
  // line repeats the enabled rows of params:query.
  const listUsers = bru(
    'get',
    `  url: {{baseUrl}}/users?expand=profile&limit=10
  body: none
  auth: inherit
}

params:query {
  expand: profile
  limit: 10
  ~debug: 1
}`
  )

  it('sends each enabled param once, not once from the url and again from params:query', () => {
    const { request } = importBrunoRequest(listUsers)
    expect(buildRequest(request, { baseUrl: 'https://api.test' }).url).toBe(
      'https://api.test/users?expand=profile&limit=10'
    )
  })

  it('keeps the params table, disabled rows included, as the editable source', () => {
    const { request } = importBrunoRequest(listUsers)
    expect(request.url).toBe('{{baseUrl}}/users')
    expect(request.query).toEqual([
      { name: 'expand', value: 'profile', enabled: true },
      { name: 'limit', value: '10', enabled: true },
      { name: 'debug', value: '1', enabled: false }
    ])
  })

  it('leaves a query written only in the url alone', () => {
    const { request } = importBrunoRequest(bru('get', '  url: https://api.test/search?q=lamp\n}'))
    expect(buildRequest(request).url).toBe('https://api.test/search?q=lamp')
  })
})

describe('Bruno body mode', () => {
  // Bruno keeps the content of every body mode used so far, in a fixed order,
  // and the `body:` line of the method block says which one is sent.
  const leftovers = `body:json {
  {
    "name": "Ada"
  }
}

body:form-urlencoded {
  name: Ada
}

body:multipart-form {
  avatar: @file(/tmp/cat.png)
}`

  it('sends the JSON body when the mode is json, whatever other bodies are saved', () => {
    const { request } = importBrunoRequest(bru('post', `  url: https://api.test/users\n  body: json\n  auth: none\n}\n\n${leftovers}`))
    expect(request.body).toEqual({ type: 'json', content: '{\n  "name": "Ada"\n}' })
  })

  it('sends the form body when the mode is formUrlEncoded', () => {
    const { request } = importBrunoRequest(
      bru('post', `  url: https://api.test/users\n  body: formUrlEncoded\n  auth: none\n}\n\n${leftovers}`)
    )
    expect(request.body).toEqual({ type: 'form', content: 'name: Ada' })
  })

  it('sends the multipart body when the mode is multipartForm', () => {
    const { request } = importBrunoRequest(
      bru('post', `  url: https://api.test/users\n  body: multipartForm\n  auth: none\n}\n\n${leftovers}`)
    )
    expect(request.body).toEqual({ type: 'multipart', content: 'avatar: @file:/tmp/cat.png' })
  })

  it('sends no body when the mode is none', () => {
    const { request } = importBrunoRequest(bru('post', `  url: https://api.test/logout\n  body: none\n  auth: none\n}\n\n${leftovers}`))
    expect(request.body).toEqual({ type: 'none', content: '' })
    expect(buildRequest(request).body).toBeUndefined()
  })

  it('maps sparql to a text body and flags a file body, which Tiger cannot send', () => {
    const sparql = importBrunoRequest(
      bru('post', `  url: https://api.test/q\n  body: sparql\n}\n\nbody:sparql {\n  SELECT * WHERE { ?s ?p ?o }\n}`)
    )
    expect(sparql.request.body).toEqual({ type: 'text', content: 'SELECT * WHERE { ?s ?p ?o }' })

    const warnings: Parameters<typeof importBrunoRequest>[2] = []
    const file = importBrunoRequest(
      bru('post', `  url: https://api.test/upload\n  body: file\n}\n\nbody:file {\n  file: @file(/tmp/a.zip) @contentType(application/zip)\n}`),
      [],
      warnings
    )
    expect(file.request.body.type).toBe('none')
    expect(warnings.map((w) => w.i18n?.key)).toContain('imports.binaryBody')
  })

  it('still takes the only body block of a file written without a mode', () => {
    const { request } = importBrunoRequest(bru('post', `  url: https://api.test/x\n}\n\nbody:text {\n  hello\n}`))
    expect(request.body).toEqual({ type: 'text', content: 'hello' })
  })
})

describe('Bruno environments folder', () => {
  const request = (name: string) => `meta {\n  name: ${name}\n  type: http\n  seq: 1\n}\n\nget {\n  url: {{baseUrl}}/x\n}\n`

  it('reads environments only from the collection root, a nested "environments" folder holds requests', () => {
    const result = importBrunoCollection(
      [
        { segments: ['bruno.json'], text: '{"version":"1","name":"Shop","type":"collection"}' },
        { segments: ['deploy', 'environments', 'list-environments.bru'], text: request('List deploy environments') },
        { segments: ['environments', 'Local.bru'], text: 'vars {\n  baseUrl: http://localhost:3000\n}\n' }
      ],
      'Shop'
    )
    expect(result.requests.map((r) => [r.path, r.request.name])).toEqual([
      [['deploy', 'environments'], 'List deploy environments']
    ])
    expect(result.environments?.map((e) => e.name)).toEqual(['Local'])
  })
})
