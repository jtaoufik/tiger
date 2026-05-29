/**
 * `{{variable}}` interpolation. Unknown tokens are left untouched so the UI can
 * highlight them; nested values (a variable whose value contains another token)
 * are resolved up to a bounded depth to avoid runaway recursion.
 */

import type { TigerEnvironment } from './types'

const TOKEN = /\{\{\s*([\w.-]+)\s*\}\}/g

export type VarMap = Record<string, string>

export function envToVars(env?: TigerEnvironment | null): VarMap {
  const out: VarMap = {}
  if (!env) return out
  for (const v of env.variables) {
    if (v.enabled !== false) out[v.name] = v.value
  }
  return out
}

export function interpolate(template: string, vars: VarMap, maxDepth = 10): string {
  let result = template
  for (let depth = 0; depth < maxDepth; depth++) {
    let changed = false
    result = result.replace(TOKEN, (match, key: string) => {
      if (Object.prototype.hasOwnProperty.call(vars, key)) {
        changed = true
        return vars[key]
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
    if (!Object.prototype.hasOwnProperty.call(vars, match[1])) missing.add(match[1])
  }
  return [...missing]
}
