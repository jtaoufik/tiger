/**
 * Collection-level settings stored in a `collection.tiger` file at the
 * collection root. Currently: a display name and a default auth that requests
 * inherit unless they set their own (an explicit `auth:none` opts out).
 */

import { parseAuth, parseKeyValues, renderAuth, tokenizeBlocks } from './tigerFormat'
import type { TigerAuth, TigerRequest } from './types'

export interface CollectionSettings {
  name?: string
  auth?: TigerAuth
}

export function parseCollectionSettings(text: string): CollectionSettings {
  const settings: CollectionSettings = {}
  for (const block of tokenizeBlocks(text)) {
    if (block.name === 'meta') {
      for (const kv of parseKeyValues(block.content)) {
        if (kv.name === 'name') settings.name = kv.value
      }
    } else if (block.name === 'auth') {
      const auth = parseAuth(block.subtype, block.content)
      if (auth.type !== 'none') settings.auth = auth
    }
  }
  return settings
}

export function serializeCollectionSettings(settings: CollectionSettings): string {
  const parts: string[] = []
  if (settings.name) parts.push(`meta {\n  name: ${settings.name}\n}`)
  if (settings.auth && settings.auth.type !== 'none') parts.push(renderAuth(settings.auth))
  return parts.length ? `${parts.join('\n\n')}\n` : ''
}

/**
 * The auth a request actually sends: its own when set (including an explicit
 * none), otherwise the collection default.
 */
export function resolveAuth(
  request: TigerRequest,
  collectionAuth: TigerAuth | undefined
): TigerAuth | undefined {
  return request.auth ?? collectionAuth
}
