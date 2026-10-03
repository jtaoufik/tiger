/**
 * Guess which tool produced an export, so a file or folder dropped on the
 * window imports without asking. Pure: the caller reads and parses the file.
 */

import type { Json } from './common'

export type DetectedFormat = 'postman' | 'insomnia' | 'openapi' | 'wsdl'

/**
 * Detect from the parsed document (JSON or YAML) or, for XML, the raw text.
 * Returns null when the content is not something Tiger imports.
 */
export function detectFormat(fileName: string, parsed: unknown, text = ''): DetectedFormat | null {
  if (/\.wsdl$/i.test(fileName)) return 'wsdl'
  if (/\.xml$/i.test(fileName)) return /<(?:\w+:)?definitions[\s>]/.test(text) ? 'wsdl' : null
  if (!parsed || typeof parsed !== 'object') return null
  const doc = parsed as Json
  const info = (doc.info ?? {}) as Json
  // An unquoted `swagger: 2.0` or `openapi: 3.1` is a number in YAML.
  const version = (v: unknown) => typeof v === 'string' || typeof v === 'number'
  if (version(doc.openapi) || version(doc.swagger)) return 'openapi'
  if (
    doc._type === 'export' ||
    Array.isArray(doc.resources) ||
    (typeof doc.type === 'string' && doc.type.startsWith('collection.insomnia.rest/'))
  ) {
    return 'insomnia'
  }
  if (
    (typeof info.schema === 'string' && info.schema.includes('getpostman.com')) ||
    typeof info._postman_id === 'string' ||
    Array.isArray(doc.item) ||
    typeof doc._postman_variable_scope === 'string' ||
    (Array.isArray(doc.values) && typeof doc.name === 'string') ||
    // Postman v1, which the importer explains how to export again.
    (Array.isArray(doc.requests) && Array.isArray(doc.order))
  ) {
    return 'postman'
  }
  return null
}
