/**
 * Environments are `.tiger` files with a `meta` name and a `vars` block:
 *
 *   meta {
 *     name: dev
 *   }
 *   vars {
 *     baseUrl: https://api.test
 *     ~token: optional-and-disabled
 *   }
 */

import { parseKeyValues, tokenizeBlocks } from './tigerFormat'
import type { TigerEnvironment } from './types'

export function parseEnvironment(text: string): TigerEnvironment {
  let name = ''
  let variables: TigerEnvironment['variables'] = []

  for (const block of tokenizeBlocks(text)) {
    if (block.name === 'meta') {
      for (const kv of parseKeyValues(block.content)) {
        if (kv.name === 'name') name = kv.value
      }
    } else if (block.name === 'vars' || block.name === 'environment') {
      variables = parseKeyValues(block.content)
    }
  }

  return { name, variables }
}

export function serializeEnvironment(env: TigerEnvironment): string {
  const lines = env.variables.map(
    (v) => `  ${v.enabled === false ? '~' : ''}${v.name}: ${v.value}`
  )
  return `meta {\n  name: ${env.name}\n}\n\nvars {\n${lines.join('\n')}\n}\n`
}
