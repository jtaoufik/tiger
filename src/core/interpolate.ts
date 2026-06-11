/**
 * `{{variable}}` interpolation. Unknown tokens are left untouched so the UI can
 * highlight them; nested values (a variable whose value contains another token)
 * are resolved up to a bounded depth to avoid runaway recursion.
 *
 * Dynamic runtime variables (prefixed with $) are resolved AFTER normal variables
 * and re-evaluated on each occurrence:
 * - {{$uuid}} — crypto.randomUUID (or Math-free crypto.getRandomValues v4 fallback)
 * - {{$timestamp}} — current epoch seconds
 * - {{$isoTimestamp}} — current ISO 8601 timestamp
 * - {{$randomInt}} — random integer 0-999999
 */

import type { TigerEnvironment } from './types'

const TOKEN = /\{\{\s*([\w.$-]+)\s*\}\}/g

export type VarMap = Record<string, string>

export function envToVars(env?: TigerEnvironment | null): VarMap {
  const out: VarMap = {}
  if (!env) return out
  for (const v of env.variables) {
    if (v.enabled !== false) out[v.name] = v.value
  }
  return out
}

/** Generate a UUIDv4 string. Falls back to Math-free crypto.getRandomValues if needed. */
function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback: generate v4 UUID using crypto.getRandomValues
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  // Set version to 4 and variant to RFC 4122
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Generate timestamp in epoch seconds. */
function generateTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString()
}

/** Generate ISO 8601 timestamp. */
function generateIsoTimestamp(): string {
  return new Date().toISOString()
}

/** Generate random integer 0-999999. */
function generateRandomInt(): string {
  return Math.floor(Math.random() * 1000000).toString()
}

/** Resolve a dynamic runtime variable. Returns undefined if not a runtime var. */
function resolveRuntimeVar(key: string): string | undefined {
  if (!key.startsWith('$')) return undefined
  switch (key) {
    case '$uuid':
      return generateUuid()
    case '$timestamp':
      return generateTimestamp()
    case '$isoTimestamp':
      return generateIsoTimestamp()
    case '$randomInt':
      return generateRandomInt()
    default:
      return undefined
  }
}

export function interpolate(template: string, vars: VarMap, maxDepth = 10): string {
  let result = template
  for (let depth = 0; depth < maxDepth; depth++) {
    let changed = false
    result = result.replace(TOKEN, (match, key: string) => {
      // Try normal variables first
      if (Object.prototype.hasOwnProperty.call(vars, key)) {
        changed = true
        return vars[key]
      }
      // Try dynamic runtime variables (always re-evaluate)
      const runtimeValue = resolveRuntimeVar(key)
      if (runtimeValue !== undefined) {
        changed = true
        return runtimeValue
      }
      return match
    })
    if (!changed) break
  }
  return result
}

/** Variable names referenced in the template that are absent from `vars`. */
export function findMissingVars(template: string, vars: VarMap): string[] {
  const missing = new Set<string>()
  for (const match of template.matchAll(TOKEN)) {
    const key = match[1]
    // $-prefixed tokens are never missing (they're dynamic runtime vars)
    if (key.startsWith('$')) continue
    if (!Object.prototype.hasOwnProperty.call(vars, key)) missing.add(key)
  }
  return [...missing]
}
