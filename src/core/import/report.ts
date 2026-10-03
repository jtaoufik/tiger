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
  if (!('collectionVariables' in result) && !('globals' in result)) return result
  const { collectionVariables: collection = [], globals = [], ...rest } = result
  // Postman resolves environment > collection > globals.
  const fromCollection = new Set(collection.map((v) => v.name))
  const vars: KeyValue[] = [...globals.filter((v) => !fromCollection.has(v.name)), ...collection]
  if (vars.length === 0) return rest
  const envs = rest.environments ?? []
  const warnings = [...(rest.warnings ?? [])]
  let environments: TigerEnvironment[]
  if (envs.length === 0) {
    const name = collection.length ? `${rest.name} variables` : 'Globals'
    environments = [{ name, variables: vars }]
    warnings.push({
      request: name,
      ...warning(collection.length ? 'imports.collectionVarsEnv' : 'imports.globalsEnv', { name })
    })
    if (collection.length && globals.length) {
      warnings.push({ request: 'Globals', ...warning('imports.postmanGlobals') })
    }
  } else {
    environments = envs.map((env) => {
      const own = new Set(env.variables.map((v) => v.name))
      return { ...env, variables: [...vars.filter((v) => !own.has(v.name)), ...env.variables] }
    })
    if (collection.length) {
      warnings.push({
        request: 'Collection variables',
        ...warning('imports.collectionVarsLayered', { names: collection.map((v) => v.name).join(', ') })
      })
    }
    if (globals.length) warnings.push({ request: 'Globals', ...warning('imports.postmanGlobals') })
  }
  return { ...rest, environments, warnings }
}
