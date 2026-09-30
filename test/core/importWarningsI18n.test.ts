import { describe, expect, it } from 'vitest'
import { importPostman, summarizeImport } from '../../src/core/import'
import { translatorFor } from '../../src/core/i18n/all'

const postman = {
  info: { name: 'Shop', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  item: [
    {
      name: 'Ping',
      request: { method: 'GET', url: 'http://x/:id/{{$randomFirstName}}', auth: { type: 'digest' } }
    }
  ]
}

describe('import warnings carry their catalog key', () => {
  it('keeps the English message and adds the key and values', () => {
    const result = importPostman(postman)
    const auth = result.warnings!.find((w) => w.i18n?.key === 'imports.authUnsupported')!
    expect(auth.message).toBe('Digest auth is not supported. Auth was set to none; set it up again.')
    expect(auth.i18n?.vars).toEqual({ auth: 'Digest' })
  })

  it('renders in French through the translator', () => {
    const fr = translatorFor('fr')
    const result = importPostman(postman)
    const w = result.warnings!.find((x) => x.i18n?.key === 'imports.pathVariables')!
    expect(w.message).toContain('Path variable :id')
    expect(fr(w.i18n!.key, w.i18n!.vars)).toBe(
      'La variable de chemin :id n’avait pas de valeur et est devenue {{id}}. Définissez-la dans un environnement.'
    )
  })

  it('summarizeImport keeps the keys next to the messages', () => {
    const s = summarizeImport(importPostman(postman))
    const item = s.items[0]
    expect(item.i18n).toHaveLength(item.messages.length)
    expect(item.i18n!.every((i) => i?.key.startsWith('imports.'))).toBe(true)
  })
})
