import { describe, expect, it } from 'vitest'
import { importBrunoRequest } from '../../src/core/import/bruno'

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
