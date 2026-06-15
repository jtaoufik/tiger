import { describe, expect, it } from 'vitest'
import {
  importBrunoEnvironment,
  importBrunoRequest,
  tokenizeBrunoBlocks
} from '../../src/core/import/bruno'

describe('importBrunoRequest – graphql', () => {
  const bru = `
meta {
  name: Heroes
  seq: 1
}

post {
  url: {{baseUrl}}/graphql
  body: graphql
}

body:graphql {
  query Heroes($first: Int) {
    heroes(first: $first) { id name }
  }
}

body:graphql:vars {
  {
    "first": 3
  }
}
`

  it('maps body:graphql to a graphql body, preserving the query document', () => {
    const { request } = importBrunoRequest(bru)
    expect(request.body.type).toBe('graphql')
    expect(request.body.content).toContain('query Heroes($first: Int)')
    expect(request.body.content).toContain('heroes(first: $first)')
  })

  it('attaches a following body:graphql:vars block as variables', () => {
    const { request } = importBrunoRequest(bru)
    expect(request.body.variables).toContain('"first": 3')
  })

  it('keeps a graphql body even without a vars block', () => {
    const noVars = `
meta { name: Q\n  seq: 1 }
post {
  url: x
}
body:graphql {
  { ping }
}
`
    const { request } = importBrunoRequest(noVars)
    expect(request.body.type).toBe('graphql')
    expect(request.body.content).toBe('{ ping }')
    expect(request.body.variables).toBeUndefined()
  })
})

describe('tokenizeBrunoBlocks – line-based delimiting', () => {
  it('survives a script block whose JS confuses brace counting', () => {
    // Mixes single-quoted strings, // comments containing }, and template
    // strings — each of which would desync the older depth-aware tokenizer.
    const bru = `meta {
  name: Login
  seq: 1
}

post {
  url: {{baseUrl}}/login
}

script:pre-request {
  const note = 'closes with }'
  // trailing brace in a comment: }
  const greet = \`hi \${name}\`
}
`
    const blocks = tokenizeBrunoBlocks(bru)
    expect(blocks.map((b) => b.name)).toEqual(['meta', 'post', 'script'])
    const { request } = importBrunoRequest(bru)
    expect(request.name).toBe('Login')
    expect(request.method).toBe('post')
    expect(request.url).toBe('{{baseUrl}}/login')
  })

  it('keeps a pretty-printed json body intact', () => {
    const bru = `post {
  url: x
}

body:json {
  {
    "nested": { "k": "v" }
  }
}
`
    const { request } = importBrunoRequest(bru)
    expect(request.body.type).toBe('json')
    expect(request.body.content).toContain('"nested"')
    expect(request.body.content).toContain('"k": "v"')
  })
})

describe('importBrunoEnvironment', () => {
  it('reads a vars block, honoring the disabled marker and ignoring vars:secret', () => {
    const env = `vars {
  baseUrl: https://api.example.com
  ~debug: 1
}

vars:secret [
  apiKey,
  password
]
`
    const result = importBrunoEnvironment(env, 'dev')
    expect(result.name).toBe('dev')
    expect(result.variables.map((v) => v.name)).toEqual(['baseUrl', 'debug'])
    const baseUrl = result.variables.find((v) => v.name === 'baseUrl')!
    expect(baseUrl.value).toBe('https://api.example.com')
    expect(baseUrl.enabled).toBe(true)
    const debug = result.variables.find((v) => v.name === 'debug')!
    expect(debug.enabled).toBe(false)
  })
})
