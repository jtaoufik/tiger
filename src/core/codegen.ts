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

export function toPython(built: BuiltRequest): string {
  const lines = ['import requests', '']
  if (Object.keys(built.headers).length) {
    lines.push(`headers = ${JSON.stringify(built.headers, null, 4)}`)
  }
  const args = [`"${built.url}"`]
  if (Object.keys(built.headers).length) args.push('headers=headers')
  if (built.body) {
    lines.push(`data = ${JSON.stringify(built.body)}`)
    args.push('data=data')
  }
  lines.push('', `response = requests.${built.method.toLowerCase()}(${args.join(', ')})`, 'print(response.status_code, response.text)')
  return lines.join('\n')
}

export type CodegenTarget = 'curl' | 'fetch' | 'python'

export function generateCode(built: BuiltRequest, target: CodegenTarget): string {
  if (target === 'curl') return toCurl(built)
  if (target === 'python') return toPython(built)
  return toFetch(built)
}
