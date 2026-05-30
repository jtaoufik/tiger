/**
 * Resolve a request's auth into concrete header / query additions. Bearer,
 * Basic and API-key are fully static. OAuth2 (client credentials) needs a token
 * round-trip, which the main process performs before build time and then passes
 * back in as a bearer token — so this pure function never touches the network.
 */

import { interpolate, type VarMap } from './interpolate'
import type { KeyValue, TigerAuth } from './types'

export interface AuthApplication {
  headers: Record<string, string>
  query: KeyValue[]
}

function base64(input: string): string {
  if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(input)))
  return Buffer.from(input, 'utf8').toString('base64')
}

export function applyAuth(auth: TigerAuth | undefined, vars: VarMap): AuthApplication {
  const result: AuthApplication = { headers: {}, query: [] }
  if (!auth || auth.type === 'none') return result

  if (auth.type === 'bearer') {
    result.headers.Authorization = `Bearer ${interpolate(auth.token, vars)}`
  } else if (auth.type === 'basic') {
    const user = interpolate(auth.username, vars)
    const pass = interpolate(auth.password, vars)
    result.headers.Authorization = `Basic ${base64(`${user}:${pass}`)}`
  } else if (auth.type === 'apikey') {
    const key = interpolate(auth.key, vars)
    const value = interpolate(auth.value, vars)
    if (auth.in === 'query') result.query.push({ name: key, value, enabled: true })
    else result.headers[key] = value
  }

  return result
}
