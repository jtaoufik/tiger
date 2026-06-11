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

  it('does not report $-prefixed dynamic tokens as missing', () => {
    expect(findMissingVars('{{a}}-{{$uuid}}-{{missing}}', { a: '1' })).toEqual(['missing'])
  })
})

describe('dynamic runtime variables', () => {
  it('resolves {{$uuid}} to a valid UUIDv4 format', () => {
    const result = interpolate('id: {{$uuid}}', {})
    const uuidRegex =
      /^id: [0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    expect(result).toMatch(uuidRegex)
  })

  it('generates different UUIDs on each occurrence', () => {
    const result = interpolate('{{$uuid}},{{$uuid}}', {})
    const [uuid1, uuid2] = result.split(',')
    expect(uuid1).not.toBe(uuid2)
  })

  it('resolves {{$timestamp}} to an epoch seconds integer', () => {
    const before = Math.floor(Date.now() / 1000)
    const result = interpolate('ts: {{$timestamp}}', {})
    const after = Math.floor(Date.now() / 1000)
    const ts = parseInt(result.split(': ')[1], 10)
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after + 1)
  })

  it('resolves {{$isoTimestamp}} to ISO 8601 format', () => {
    const result = interpolate('time: {{$isoTimestamp}}', {})
    const isoRegex = /^time: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    expect(result).toMatch(isoRegex)
  })

  it('resolves {{$randomInt}} to a number between 0 and 999999', () => {
    const result = interpolate('rand: {{$randomInt}}', {})
    const num = parseInt(result.split(': ')[1], 10)
    expect(num).toBeGreaterThanOrEqual(0)
    expect(num).toBeLessThan(1000000)
  })

  it('generates different random integers on each occurrence', () => {
    // Statistically very unlikely to get the same random int twice in 100 samples
    const results = new Set<string>()
    for (let i = 0; i < 100; i++) {
      const result = interpolate('{{$randomInt}}', {})
      results.add(result)
    }
    expect(results.size).toBeGreaterThan(1)
  })

  it('mixes normal vars and dynamic runtime vars', () => {
    const result = interpolate('{{host}}/id={{$uuid}}/ts={{$timestamp}}', { host: 'api.test' })
    expect(result).toMatch(/^api\.test\/id=[0-9a-f-]+\/ts=\d+$/)
  })

  it('does not resolve unknown $-prefixed tokens', () => {
    const result = interpolate('{{$unknown}}', {})
    expect(result).toBe('{{$unknown}}')
  })

  it('re-evaluates runtime vars on each pass (different values in nested scenarios)', () => {
    // If we had a var that contains {{$randomInt}}, it should re-evaluate
    const result = interpolate('{{wrapper}}', { wrapper: 'val={{$randomInt}}' })
    // The {{$randomInt}} inside the wrapper var should be resolved to an actual number
    expect(result).toMatch(/^val=\d+$/)
  })
})
