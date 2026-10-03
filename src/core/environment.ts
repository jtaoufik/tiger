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

import { keyValueLine, parseKeyValues, tokenizeBlocks } from './tigerFormat'
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
  const line = (v: { enabled: boolean; name: string; value: string }) => `  ${keyValueLine(v)}`
  const plain = env.variables.filter((v) => !v.secret)
  const secret = env.variables.filter((v) => v.secret)
  const parts = [`meta {\n  name: ${env.name}\n}`]
  parts.push(`vars {\n${plain.map(line).join('\n')}\n}`)
  if (secret.length) parts.push(`vars:secret {\n${secret.map(line).join('\n')}\n}`)
  return `${parts.join('\n\n')}\n`
}

/**
 * Whether an environment's name says production ("Prod", "production",
 * "live-eu", "prod_eu", "PROD_US", "prodEU", "prd", "Prod2"; not "preprod",
 * "products" or "liveness"). Tiger never selects one of these by itself, so
 * an import cannot send to production by surprise.
 */
export function looksLikeProduction(name: string): boolean {
  const words = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z]+/)
  return words.some((w) => w === 'prod' || w === 'production' || w === 'prd' || w === 'live')
}
