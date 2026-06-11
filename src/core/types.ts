/**
 * Core domain types for Tiger. These are pure data shapes with no DOM or Node
 * dependency so they can be shared by the renderer, the main process and tests.
 */

export const HTTP_METHODS = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options'
] as const

export type HttpMethod = (typeof HTTP_METHODS)[number]

/** A header or query parameter. `enabled` defaults to true when omitted. */
export interface KeyValue {
  name: string
  value: string
  enabled: boolean
  /** Environment variables only: hide the value in the UI. */
  secret?: boolean
}

export type TigerAuth =
  | { type: 'none' }
  | { type: 'bearer'; token: string }
  | { type: 'basic'; username: string; password: string }
  | { type: 'apikey'; key: string; value: string; in: 'header' | 'query' }
  | {
      type: 'oauth2'
      grantType: 'client_credentials'
      tokenUrl: string
      clientId: string
      clientSecret: string
      scope: string
    }

export type BodyType = 'none' | 'json' | 'xml' | 'text' | 'form'

export interface TigerBody {
  type: BodyType
  /**
   * Raw body content. For `json`/`text` this is the literal payload. For `form`
   * it holds `key: value` lines parsed into url-encoded pairs at request time.
   */
  content: string
}

/** One HTTP request, the in-memory form of a single `.tiger` file. */
export interface TigerRequest {
  name: string
  seq?: number
  method: HttpMethod
  url: string
  headers: KeyValue[]
  query: KeyValue[]
  body: TigerBody
  auth?: TigerAuth
}

/** A named set of `{{variable}}` values. */
export interface TigerEnvironment {
  name: string
  variables: KeyValue[]
}

export function isHttpMethod(value: string): value is HttpMethod {
  return (HTTP_METHODS as readonly string[]).includes(value)
}

export function emptyBody(): TigerBody {
  return { type: 'none', content: '' }
}
