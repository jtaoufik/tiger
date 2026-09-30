/**
 * The numbers and notes shown after an import: what came in, and what only
 * came in partly (grouped per request so the list reads like a checklist).
 */

import { folderPaths, warning } from './common'
import type { KeyValue, TigerEnvironment } from '../types'
import type { ImportResult, ImportWarning, MessageI18n } from './types'

export interface ImportSummary {
  name: string
  requests: number
  folders: number
  environments: number
  /** Warnings grouped by the item they concern, in first-seen order. */
  items: SummaryItem[]
}

export interface SummaryItem {
  request?: string
  path: string[]
  messages: string[]
  /**
   * Parallel to `messages`: the catalog key and values of each one, so the
   * report can show it in the user's language. Left out when none has one.
   */
  i18n?: Array<MessageI18n | undefined>
}

export function summarizeImport(result: ImportResult): ImportSummary {
  const groups = new Map<string, SummaryItem>()
  const add = (w: ImportWarning) => {
    const path = w.path ?? []
    const key = `${path.join('/')}\u0000${w.request ?? ''}`
    const group = groups.get(key) ?? { request: w.request, path, messages: [] }
    if (!group.messages.includes(w.message)) {
      group.messages.push(w.message)
      if (w.i18n) {
        const list = (group.i18n ??= group.messages.slice(0, -1).map(() => undefined))
        list.push(w.i18n)
      } else group.i18n?.push(undefined)
    }
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
      ...warning('imports.collectionVarsEnv', { name })
    })
  } else {
    environments = envs.map((env) => {
      const own = new Set(env.variables.map((v) => v.name))
      return { ...env, variables: [...vars.filter((v) => !own.has(v.name)), ...env.variables] }
    })
    warnings.push({
      request: 'Collection variables',
      ...warning('imports.collectionVarsLayered', { names: vars.map((v) => v.name).join(', ') })
    })
  }
  return { ...rest, environments, warnings }
}
