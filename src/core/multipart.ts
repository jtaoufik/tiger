/**
 * Multipart form-data bodies. The .tiger representation reuses the form line
 * syntax, with a `@file:` value prefix marking file rows:
 *
 *   body:multipart {
 *     name: Ada
 *     avatar: @file:/Users/ada/cat.png
 *     ~debug: 1
 *   }
 *
 * Assembly is pure: file bytes are injected by the caller (main process reads
 * the disk), so boundary handling is fully unit-testable.
 */

import type { KeyValue } from './types'

export const FILE_PREFIX = '@file:'

export interface MultipartRow extends KeyValue {
  /** True when the value is a file path to upload (`@file:` prefix). */
  isFile: boolean
}

/** Parse `body:multipart` content lines into rows (`~` prefix = disabled). */
export function parseMultipartContent(content: string): MultipartRow[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('//'))
    .map((line) => {
      const enabled = !line.startsWith('~')
      const body = enabled ? line : line.slice(1)
      const idx = body.indexOf(':')
      const name = idx === -1 ? body.trim() : body.slice(0, idx).trim()
      const rawValue = idx === -1 ? '' : body.slice(idx + 1).trim()
      const isFile = rawValue.startsWith(FILE_PREFIX)
      return {
        name,
        value: isFile ? rawValue.slice(FILE_PREFIX.length) : rawValue,
        enabled,
        isFile
      }
    })
}

/** A part ready for assembly: text value, or file bytes with a name. */
export interface MultipartPart {
  name: string
  value: string | Uint8Array
  /** File name reported to the server (file parts only). */
  fileName?: string
  /** Part content type; file parts default to application/octet-stream. */
  contentType?: string
}

export function generateBoundary(): string {
  let suffix = ''
  for (let i = 0; i < 24; i++) suffix += Math.floor(Math.random() * 16).toString(16)
  return `----TigerFormBoundary${suffix}`
}

/**
 * Assemble RFC 2046 multipart/form-data bytes. Returns the body and the exact
 * Content-Type header value carrying the boundary.
 */
export function assembleMultipart(
  parts: MultipartPart[],
  boundary: string
): { bytes: Uint8Array; contentType: string } {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const push = (text: string) => chunks.push(encoder.encode(text))

  for (const part of parts) {
    push(`--${boundary}\r\n`)
    if (part.fileName !== undefined) {
      push(
        `Content-Disposition: form-data; name="${part.name}"; filename="${part.fileName}"\r\n` +
          `Content-Type: ${part.contentType ?? 'application/octet-stream'}\r\n\r\n`
      )
    } else {
      push(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n`)
    }
    chunks.push(typeof part.value === 'string' ? encoder.encode(part.value) : part.value)
    push('\r\n')
  }
  push(`--${boundary}--\r\n`)

  const total = chunks.reduce((n, c) => n + c.length, 0)
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    bytes.set(c, offset)
    offset += c.length
  }
  return { bytes, contentType: `multipart/form-data; boundary=${boundary}` }
}
