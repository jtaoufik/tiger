/** Generate runnable snippets from a built request. */

import type { BuiltRequest } from './request'

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

export function toCurl(built: BuiltRequest): string {
  const parts = [`curl -X ${built.method} ${shellQuote(built.url)}`]
  for (const [name, value] of Object.entries(built.headers)) {
    parts.push(`-H ${shellQuote(`${name}: ${value}`)}`)
  }
  if (built.body) parts.push(`--data ${shellQuote(built.body)}`)
  return parts.join(' \\\n  ')
}

export function toFetch(built: BuiltRequest): string {
  const init: Record<string, unknown> = { method: built.method }
  if (Object.keys(built.headers).length) init.headers = built.headers
  if (built.body) init.body = built.body
  return `await fetch(${JSON.stringify(built.url)}, ${JSON.stringify(init, null, 2)})`
}

export type CodegenTarget = 'curl' | 'fetch'

export function generateCode(built: BuiltRequest, target: CodegenTarget): string {
  return target === 'curl' ? toCurl(built) : toFetch(built)
}
