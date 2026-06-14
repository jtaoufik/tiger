import { describe, expect, it } from 'vitest'
import { sanitizeCollectionName } from '../../src/core/newCollection'

describe('sanitizeCollectionName', () => {
  it('keeps a normal name', () => {
    expect(sanitizeCollectionName('Payments API')).toBe('Payments API')
  })
  it('trims surrounding whitespace and collapses runs', () => {
    expect(sanitizeCollectionName('  My   API  ')).toBe('My API')
  })
  it('strips path separators and illegal characters', () => {
    expect(sanitizeCollectionName('a/b\\c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j')
  })
  it('removes leading dots and trailing dots/spaces', () => {
    expect(sanitizeCollectionName('..hidden')).toBe('hidden')
    expect(sanitizeCollectionName('weird. ')).toBe('weird')
  })
  it('returns null when nothing usable remains', () => {
    expect(sanitizeCollectionName('   ')).toBeNull()
    expect(sanitizeCollectionName('/////')).toBeNull()
    expect(sanitizeCollectionName('')).toBeNull()
  })
})
