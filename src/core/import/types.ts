import type { TigerRequest } from '../types'

/** A request plus the folder path it lives under within a collection. */
export interface ImportedRequest {
  path: string[]
  request: TigerRequest
}

export type ImportSource = 'postman' | 'bruno' | 'openapi' | 'insomnia' | 'wsdl'

export interface ImportResult {
  name: string
  source: ImportSource
  requests: ImportedRequest[]
}
