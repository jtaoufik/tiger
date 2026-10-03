/** Generate runnable snippets from a built request. */

import type { BuiltRequest } from './request'

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

/**
 * curl options for the body. curl reads a file for a --data value or a -F
 * value that starts with @ (or <): bodies go as --data-raw and form text
 * fields as --form-string, so only real file rows (-F name=@path) read one.
 */
function curlBodyArgs(built: BuiltRequest, quote: (value: string) => string): string[] {
  if (built.multipart?.length) {
    return built.multipart.map((part) =>
      part.isFile
        ? `-F ${quote(`${part.name}=@${part.value}`)}`
        : `--form-string ${quote(`${part.name}=${part.value}`)}`
    )
  }
  return built.body ? [`--data-raw ${quote(built.body)}`] : []
}

export function toCurl(built: BuiltRequest): string {
  const parts = [`curl -X ${built.method} ${shellQuote(built.url)}`]
  for (const [name, value] of Object.entries(built.headers)) {
    parts.push(`-H ${shellQuote(`${name}: ${value}`)}`)
  }
  parts.push(...curlBodyArgs(built, shellQuote))
  return parts.join(' \\\n  ')
}

/** The file name of a path, with / or \ separators. */
function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/**
 * Headers for a snippet whose client builds the multipart body itself: the
 * Content-Type it writes carries the boundary, so the request's own is left out.
 */
function snippetHeaders(built: BuiltRequest): Record<string, string> {
  if (!built.multipart?.length) return built.headers
  return Object.fromEntries(Object.entries(built.headers).filter(([name]) => name.toLowerCase() !== 'content-type'))
}

export function toFetch(built: BuiltRequest): string {
  const init: Record<string, unknown> = { method: built.method }
  const headers = snippetHeaders(built)
  if (Object.keys(headers).length) init.headers = headers
  if (built.multipart?.length) {
    // A FormData body: text fields as they are, file rows read from disk (Node).
    const lines = built.multipart.some((p) => p.isFile) ? ["import { readFile } from 'node:fs/promises'", ''] : []
    lines.push('const form = new FormData()')
    for (const part of built.multipart) {
      const name = JSON.stringify(part.name)
      const value = JSON.stringify(part.value)
      lines.push(
        part.isFile
          ? `form.append(${name}, new Blob([await readFile(${value})]), ${JSON.stringify(baseName(part.value))})`
          : `form.append(${name}, ${value})`
      )
    }
    const initText = JSON.stringify(init, null, 2).replace(/\n}$/, ',\n  "body": form\n}')
    lines.push('', `await fetch(${JSON.stringify(built.url)}, ${initText})`)
    return lines.join('\n')
  }
  if (built.body) init.body = built.body
  return `await fetch(${JSON.stringify(built.url)}, ${JSON.stringify(init, null, 2)})`
}

export function toPython(built: BuiltRequest): string {
  const lines = ['import requests', '']
  const headers = snippetHeaders(built)
  if (Object.keys(headers).length) {
    lines.push(`headers = ${JSON.stringify(headers, null, 4)}`)
  }
  const args = [`"${built.url}"`]
  if (Object.keys(headers).length) args.push('headers=headers')
  if (built.multipart?.length) {
    // files= makes requests send multipart/form-data; (None, value) is a text field.
    lines.push('files = [')
    for (const part of built.multipart) {
      const value = part.isFile
        ? `(${JSON.stringify(baseName(part.value))}, open(${JSON.stringify(part.value)}, "rb"))`
        : `(None, ${JSON.stringify(part.value)})`
      lines.push(`    (${JSON.stringify(part.name)}, ${value}),`)
    }
    lines.push(']')
    args.push('files=files')
  } else if (built.body) {
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
