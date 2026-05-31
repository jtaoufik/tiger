/**
 * Import a Bruno `.bru` request. Bruno's on-disk format is a close cousin of
 * Tiger's, so we reuse the same block tokenizer and map the pieces across.
 */

import { dedent, parseKeyValues, tokenizeBlocks } from '../tigerFormat'
import { emptyBody, isHttpMethod, type BodyType, type TigerBody, type TigerRequest } from '../types'
import type { ImportedRequest } from './types'

function brunoBodyType(subtype: string | undefined): BodyType {
  switch (subtype) {
    case 'json':
      return 'json'
    case 'text':
    case 'xml':
    case 'sparql':
      return 'text'
    case 'form-urlencoded':
    case 'multipart-form':
      return 'form'
    default:
      return 'text'
  }
}

/** Parse a single `.bru` file into a Tiger request. */
export function importBrunoRequest(text: string, path: string[] = []): ImportedRequest {
  const blocks = tokenizeBlocks(text)

  const request: TigerRequest = {
    name: '',
    method: 'get',
    url: '',
    headers: [],
    query: [],
    body: emptyBody()
  }

  for (const block of blocks) {
    if (block.name === 'meta') {
      for (const kv of parseKeyValues(block.content)) {
        if (kv.name === 'name') request.name = kv.value
        else if (kv.name === 'seq') request.seq = Number(kv.value)
      }
    } else if (isHttpMethod(block.name)) {
      request.method = block.name
      for (const kv of parseKeyValues(block.content)) {
        // Bruno keeps `body`/`auth` selectors in the method block — ignore them.
        if (kv.name === 'url') request.url = kv.value
      }
    } else if (block.name === 'headers') {
      request.headers = parseKeyValues(block.content)
    } else if (block.name === 'query' || block.name === 'params') {
      request.query = parseKeyValues(block.content)
    } else if (block.name === 'body') {
      const type = brunoBodyType(block.subtype)
      const content =
        type === 'form'
          ? parseKeyValues(block.content)
              .map((kv) => `${kv.enabled ? '' : '~'}${kv.name}: ${kv.value}`)
              .join('\n')
          : dedent(block.content)
      request.body = { type, content } as TigerBody
    }
  }

  return { path, request }
}
