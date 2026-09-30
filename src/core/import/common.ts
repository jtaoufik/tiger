/**
 * Helpers shared by the importers: path variables, script inheritance, and
 * the checks that turn partially mapped features into report warnings.
 */

import { findUnknownDynamicVars } from '../interpolate'
import { findUnsupportedScriptApis } from '../scriptCompat'
import type { TigerRequest } from '../types'
import type { ImportWarning } from './types'

export type Json = Record<string, unknown>

export function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** Any scalar as text (numbers and booleans from JSON/YAML exports). */
export function scalar(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

// A path variable is a `:name` segment right after a slash (so `host:8080`
// and `/v1/items:batchGet` are left alone).
const PATH_VAR = /\/:([A-Za-z_][\w-]*)/g

/**
 * Replace `/:name` path segments. A known non-empty value is written into the
 * URL as-is (it may itself be a `{{variable}}`); anything else becomes
 * `{{name}}` so it can be set in an environment, and is returned as missing.
 */
export function applyPathVariables(
  url: string,
  values: Array<{ name: string; value: string }>
): { url: string; missing: string[] } {
  const missing: string[] = []
  const byName = new Map(values.map((v) => [v.name, v.value]))
  const out = url.replace(PATH_VAR, (_m, name: string) => {
    const value = byName.get(name)
    if (value) return `/${value}`
    if (!missing.includes(name)) missing.push(name)
    return `/{{${name}}}`
  })
  return { url: out, missing }
}

/** Report line for path variables that had no value. */
export function pathVariableWarning(missing: string[]): string {
  const many = missing.length > 1
  return `Path variable${many ? 's' : ''} ${missing.map((m) => `:${m}`).join(', ')} had no value and became ${missing
    .map((m) => `{{${m}}}`)
    .join(', ')}. Set ${many ? 'them' : 'it'} in an environment.`
}

/** Join script sources (outermost first), skipping empty ones. */
export function joinScripts(...parts: Array<string | undefined>): string | undefined {
  const kept = parts.filter((p): p is string => !!p && !!p.trim())
  return kept.length ? kept.join('\n\n') : undefined
}

/** Every string in a request that can hold `{{variables}}`. */
function requestText(req: TigerRequest): string {
  const parts = [req.url, req.body.content, req.body.variables ?? '']
  for (const kv of [...req.headers, ...req.query]) parts.push(kv.name, kv.value)
  const auth = req.auth
  if (auth && auth.type !== 'none') parts.push(...Object.values(auth).map(String))
  return parts.join('\n')
}

/**
 * Flag what an imported request uses that Tiger cannot run as-is: unknown
 * dynamic variables and unsupported script calls.
 */
export function checkRequest(req: TigerRequest, path: string[], warnings: ImportWarning[]): void {
  const unknownVars = findUnknownDynamicVars(requestText(req))
  if (unknownVars.length) {
    warnings.push({
      request: req.name,
      path,
      message: `Uses dynamic variables Tiger does not generate: ${unknownVars
        .map((v) => `{{${v}}}`)
        .join(', ')}. Set them in an environment or replace them.`
    })
  }
  const pre = findUnsupportedScriptApis(req.preScript)
  if (pre.length) {
    warnings.push({
      request: req.name,
      path,
      message: `Pre-request script uses calls Tiger cannot run: ${pre.join('; ')}. The script is kept; review it.`
    })
  }
  const post = findUnsupportedScriptApis(req.postScript)
  if (post.length) {
    warnings.push({
      request: req.name,
      path,
      message: `Test script uses calls Tiger cannot run: ${post.join('; ')}. The script is kept; review it.`
    })
  }
}

/** Distinct folder paths (every ancestor included) used by the requests. */
export function folderPaths(requests: Array<{ path: string[] }>): string[][] {
  const seen = new Map<string, string[]>()
  for (const { path } of requests) {
    for (let i = 1; i <= path.length; i++) {
      const p = path.slice(0, i)
      seen.set(p.join('\u0000'), p)
    }
  }
  return [...seen.values()]
}
