/**
 * Export Tiger requests to a Postman v2.1 collection. Folder paths become nested
 * Postman item groups, so a Tiger collection round-trips back through importer.
 */

import type { ImportedRequest } from './import/types'
import type { KeyValue, TigerRequest } from './types'

interface PostmanItem {
  name: string
  item?: PostmanItem[]
  request?: unknown
}

function mapKeyValues(items: KeyValue[]): unknown[] {
  return items.map((kv) => ({
    key: kv.name,
    value: kv.value,
    ...(kv.enabled === false ? { disabled: true } : {})
  }))
}

function toPostmanUrl(req: TigerRequest): unknown {
  const enabledQuery = req.query.filter((q) => q.name)
  const qs = enabledQuery
    .filter((q) => q.enabled !== false)
    .map((q) => `${q.name}=${q.value}`)
    .join('&')
  return {
    raw: qs ? `${req.url}?${qs}` : req.url,
    query: enabledQuery.length ? mapKeyValues(enabledQuery) : undefined
  }
}

function toPostmanBody(req: TigerRequest): unknown {
  if (req.body.type === 'json' || req.body.type === 'text') {
    return {
      mode: 'raw',
      raw: req.body.content,
      options: { raw: { language: req.body.type === 'json' ? 'json' : 'text' } }
    }
  }
  if (req.body.type === 'form') {
    const pairs = req.body.content
      .split('\n')
      .filter((l) => l.trim())
      .map((line) => {
        const disabled = line.trimStart().startsWith('~')
        const l = disabled ? line.trim().slice(1) : line
        const idx = l.indexOf(':')
        return {
          key: idx === -1 ? l.trim() : l.slice(0, idx).trim(),
          value: idx === -1 ? '' : l.slice(idx + 1).trim(),
          ...(disabled ? { disabled: true } : {})
        }
      })
    return { mode: 'urlencoded', urlencoded: pairs }
  }
  return undefined
}

function toPostmanRequest(req: TigerRequest): unknown {
  return {
    method: req.method.toUpperCase(),
    header: mapKeyValues(req.headers),
    url: toPostmanUrl(req),
    ...(req.body.type !== 'none' ? { body: toPostmanBody(req) } : {})
  }
}

function ensureFolder(root: PostmanItem[], path: string[]): PostmanItem[] {
  let level = root
  for (const segment of path) {
    let folder = level.find((item) => item.item && item.name === segment)
    if (!folder) {
      folder = { name: segment, item: [] }
      level.push(folder)
    }
    level = folder.item!
  }
  return level
}

export function exportPostman(name: string, requests: ImportedRequest[]): unknown {
  const root: PostmanItem[] = []
  for (const { path, request } of requests) {
    ensureFolder(root, path).push({
      name: request.name,
      request: toPostmanRequest(request)
    })
  }
  return {
    info: {
      name,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: root
  }
}
