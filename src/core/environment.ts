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
      const parsed = parseKeyValues(block.content)
      if (block.subtype === 'secret') {
        variables = [...variables, ...parsed.map((v) => ({ ...v, secret: true }))]
      } else {
        variables = [...parsed, ...variables]
      }
    }
  }

  return { name, variables }
}

export function serializeEnvironment(env: TigerEnvironment): string {
  const line = (v: { enabled: boolean; name: string; value: string }) =>
    `  ${v.enabled === false ? '~' : ''}${v.name}: ${v.value}`
  const plain = env.variables.filter((v) => !v.secret)
  const secret = env.variables.filter((v) => v.secret)
  const parts = [`meta {\n  name: ${env.name}\n}`]
  parts.push(`vars {\n${plain.map(line).join('\n')}\n}`)
  if (secret.length) parts.push(`vars:secret {\n${secret.map(line).join('\n')}\n}`)
  return `${parts.join('\n\n')}\n`
}
