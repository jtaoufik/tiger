import { describe, expect, it } from 'vitest'
import { tokenizeJson, formatJsonText } from '../../src/core/jsonHighlight'

describe('tokenizeJson', () => {
  it('marks object keys distinctly from string values', () => {
    const tokens = tokenizeJson('{ "name": "Ada" }')
    expect(tokens.find((t) => t.text === '"name"')?.type).toBe('key')
    expect(tokens.find((t) => t.text === '"Ada"')?.type).toBe('string')
  })

  it('classifies numbers, booleans and null', () => {
    const tokens = tokenizeJson('[1, -2.5, 3e8, true, false, null]')
    expect(tokens.filter((t) => t.type === 'number').map((t) => t.text)).toEqual([
      '1',
      '-2.5',
      '3e8'
    ])
    expect(tokens.filter((t) => t.type === 'literal').map((t) => t.text)).toEqual([
      'true',
      'false',
      'null'
    ])
  })

  it('keeps escaped quotes inside strings intact', () => {
    const tokens = tokenizeJson('{ "a": "say \\"hi\\"" }')
    expect(tokens.find((t) => t.type === 'string')?.text).toBe('"say \\"hi\\""')
  })

  it('emits punctuation and preserves whitespace as plain tokens', () => {
    const all = tokenizeJson('{\n  "a": 1\n}')
    expect(all.map((t) => t.text).join('')).toBe('{\n  "a": 1\n}')
    expect(all.some((t) => t.type === 'punct' && t.text === '{')).toBe(true)
  })

  it('round-trips arbitrary text losslessly', () => {
    const text = '{"a":[1,"x",{"b":null}],"c":"y"} trailing'
    expect(
      tokenizeJson(text)
        .map((t) => t.text)
        .join('')
    ).toBe(text)
  })
})

describe('formatJsonText', () => {
  it('pretty-prints valid json', () => {
    expect(formatJsonText('{"a":1}')).toEqual({ ok: true, formatted: '{\n  "a": 1\n}' })
  })

  it('reports invalid json without throwing', () => {
    expect(formatJsonText('{nope').ok).toBe(false)
  })

  it('treats empty input as invalid', () => {
    expect(formatJsonText('   ').ok).toBe(false)
  })
})
