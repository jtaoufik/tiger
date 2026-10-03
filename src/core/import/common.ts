/**
 * Helpers shared by the importers: path variables, script inheritance, and
 * the checks that turn partially mapped features into report warnings.
 */

import { findUnknownDynamicVars } from '../interpolate'
import { findUnsupportedScriptApis } from '../scriptCompat'
import { createTranslator, type LocaleCatalog, type MessageKey, type Vars } from '../i18n/translator'
import { imports as importMessages } from '../i18n/messages/en/imports'
import type { TigerRequest } from '../types'
import type { ImportWarning, MessageI18n } from './types'

export type Json = Record<string, unknown>

/**
 * A warning's text: the English `message` (unchanged, tests and tools read
 * it) plus the catalog key and values, so the report can translate it.
 */
export type WarningText = { message: string; i18n: MessageI18n }

/**
 * English text of the import warnings only: importers also run in the
 * renderer (curl, dropped files), and the full English catalog must stay out
 * of its startup chunk.
 */
let englishImports: ReturnType<typeof createTranslator> | undefined

export function warning(key: MessageKey, vars?: Vars): WarningText {
  englishImports ??= createTranslator('en', undefined, importMessages as LocaleCatalog)
  return { message: englishImports(key, vars), i18n: vars ? { key, vars } : { key } }
}

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
export function pathVariableWarning(missing: string[]): WarningText {
  return warning('imports.pathVariables', {
    count: missing.length,
    names: missing.map((m) => `:${m}`).join(', '),
    values: missing.map((m) => `{{${m}}}`).join(', ')
  })
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
      ...warning('imports.dynamicVars', { names: unknownVars.map((v) => `{{${v}}}`).join(', ') })
    })
  }
  const pre = findUnsupportedScriptApis(req.preScript)
  if (pre.length) {
    warnings.push({
      request: req.name,
      path,
      ...warning('imports.preScriptCalls', { calls: pre.join('; ') })
    })
  }
  const post = findUnsupportedScriptApis(req.postScript)
  if (post.length) {
    warnings.push({
      request: req.name,
      path,
      ...warning('imports.testScriptCalls', { calls: post.join('; ') })
    })
  }
}

/**
 * Names for sibling folders, given in display order. Tiger knows a folder by
 * its name path, so two siblings named "Admin" would share one folder (and
 * one folder auth): the second becomes "Admin 2", or the next number no
 * sibling already uses.
 */
export function uniqueSiblingNames(names: string[]): string[] {
  const taken = new Set(names)
  const used = new Set<string>()
  return names.map((name) => {
    let out = name
    if (used.has(out)) {
      let n = 2
      while (taken.has(`${name} ${n}`) || used.has(`${name} ${n}`)) n++
      out = `${name} ${n}`
    }
    used.add(out)
    return out
  })
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
