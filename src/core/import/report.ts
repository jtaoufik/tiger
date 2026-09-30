/**
 * The numbers and notes shown after an import: what came in, and what only
 * came in partly (grouped per request so the list reads like a checklist).
 */

import { folderPaths } from './common'
import type { KeyValue, TigerEnvironment } from '../types'
import type { ImportResult, ImportWarning } from './types'

export interface ImportSummary {
  name: string
  requests: number
  folders: number
  environments: number
  /** Warnings grouped by the item they concern, in first-seen order. */
  items: Array<{ request?: string; path: string[]; messages: string[] }>
}

export function summarizeImport(result: ImportResult): ImportSummary {
  const groups = new Map<string, { request?: string; path: string[]; messages: string[] }>()
  const add = (w: ImportWarning) => {
    const path = w.path ?? []
    const key = `${path.join('/')}\u0000${w.request ?? ''}`
    const group = groups.get(key) ?? { request: w.request, path, messages: [] }
    if (!group.messages.includes(w.message)) group.messages.push(w.message)
    groups.set(key, group)
  }
  for (const w of result.warnings ?? []) add(w)
  return {
    name: result.name,
    requests: result.requests.length,
    folders: folderPaths(result.requests).length,
    environments: result.environments?.length ?? 0,
    items: [...groups.values()]
  }
}

/**
 * Fold collection variables into the environments. Postman and Bruno layer
 * collection variables under the active environment; Tiger has one scope, so
 * each imported environment gets the collection variables it does not
 * override. Without any environment they become one named "<name> variables".
 * Idempotent: the `collectionVariables` field is consumed.
 */
export function layerCollectionVariables(result: ImportResult): ImportResult {
  const vars: KeyValue[] = result.collectionVariables ?? []
  if (!('collectionVariables' in result)) return result
  const { collectionVariables: _consumed, ...rest } = result
  if (vars.length === 0) return rest
  const envs = rest.environments ?? []
  const warnings = [...(rest.warnings ?? [])]
  let environments: TigerEnvironment[]
  if (envs.length === 0) {
    const name = `${rest.name} variables`
    environments = [{ name, variables: vars }]
    warnings.push({
      request: name,
      message: `Collection variables became the environment "${name}". It is selected for you.`
    })
  } else {
    environments = envs.map((env) => {
      const own = new Set(env.variables.map((v) => v.name))
      return { ...env, variables: [...vars.filter((v) => !own.has(v.name)), ...env.variables] }
    })
    warnings.push({
      request: 'Collection variables',
      message: `Tiger has one variable scope, so the collection variables (${vars
        .map((v) => v.name)
        .join(', ')}) were added to each environment. Values set in an environment win.`
    })
  }
  return { ...rest, environments, warnings }
}
