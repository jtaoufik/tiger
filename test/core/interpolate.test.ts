import { describe, expect, it } from 'vitest'
import { envToVars, findMissingVars, interpolate } from '../../src/core/interpolate'
import type { TigerEnvironment } from '../../src/core/types'

describe('interpolate', () => {
  it('replaces known tokens', () => {
    expect(interpolate('{{a}}/{{b}}', { a: 'x', b: 'y' })).toBe('x/y')
  })

  it('tolerates whitespace inside the braces', () => {
    expect(interpolate('{{  a  }}', { a: 'x' })).toBe('x')
  })

  it('leaves unknown tokens untouched', () => {
    expect(interpolate('{{a}}/{{missing}}', { a: 'x' })).toBe('x/{{missing}}')
  })

  it('resolves nested variables', () => {
    expect(interpolate('{{url}}', { url: '{{host}}/v1', host: 'https://api.test' })).toBe(
      'https://api.test/v1'
    )
  })

  it('does not loop forever on a self-referential variable', () => {
    expect(interpolate('{{a}}', { a: '{{a}}' })).toBe('{{a}}')
  })
})

describe('envToVars', () => {
  it('returns an empty map for no environment', () => {
    expect(envToVars(null)).toEqual({})
  })

  it('skips disabled variables', () => {
    const env: TigerEnvironment = {
      name: 'dev',
      variables: [
        { name: 'a', value: '1', enabled: true },
        { name: 'b', value: '2', enabled: false }
      ]
    }
    expect(envToVars(env)).toEqual({ a: '1' })
  })
})

describe('findMissingVars', () => {
  it('lists referenced tokens absent from the map', () => {
    expect(findMissingVars('{{a}}-{{b}}-{{a}}', { a: '1' })).toEqual(['b'])
  })
})
