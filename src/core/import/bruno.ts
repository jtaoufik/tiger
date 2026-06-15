/**
 * Import a Bruno `.bru` request. Bruno's on-disk format is a close cousin of
 * Tiger's, but uses a line-based block structure (header line ends with `{`,
 * closing `}` sits alone at column 0). We tokenize on that shape rather than by
 * counting braces, because `script:*` / `tests` blocks frequently hold JS whose
 * single-quoted strings, regex literals, or `//` comments throw off any
 * depth-aware scanner.
 */

import { dedent, parseKeyValues, type RawBlock } from '../tigerFormat'
import {
  emptyBody,
  isHttpMethod,
  type BodyType,
  type TigerBody,
  type TigerEnvironment,
  type TigerRequest
} from '../types'
import type { ImportedRequest } from './types'

const BLOCK_HEADER = /^([A-Za-z][\w-]*)(?::([\w:-]+))?\s*\{\s*$/
const BLOCK_END = /^\}\s*$/

/**
 * Split a `.bru` document into its top-level blocks. Bruno does not nest
 * blocks, so a line-based scan is both simpler and more forgiving than the
 * brace counter used for `.tiger` files.
 */
export function tokenizeBrunoBlocks(input: string): RawBlock[] {
  const blocks: RawBlock[] = []
  const lines = input.split('\n')
  let i = 0
  while (i < lines.length) {
    const header = lines[i].match(BLOCK_HEADER)
    if (!header) {
      i++
      continue
    }
    const name = header[1]
    const subtype = header[2]
    let end = -1
    for (let j = i + 1; j < lines.length; j++) {
      if (BLOCK_END.test(lines[j])) {
        end = j
        break
      }
    }
    if (end === -1) break
    blocks.push({ name, subtype, content: lines.slice(i + 1, end).join('\n') })
    i = end + 1
  }
  return blocks
}

function brunoBodyType(subtype: string | undefined): BodyType {
  switch (subtype) {
    case 'json':
      return 'json'
    case 'xml':
      return 'xml'
    case 'text':
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
  const blocks = tokenizeBrunoBlocks(text)

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
    } else if (block.name === 'body' && block.subtype === 'graphql') {
      // Bruno keeps the GraphQL query in `body:graphql` and (optionally) the
      // variables JSON in a following `body:graphql:vars` block.
      request.body = { type: 'graphql', content: dedent(block.content) }
    } else if (block.name === 'body' && block.subtype === 'graphql:vars') {
      const vars = dedent(block.content)
      // Attach to the query body if we have one, else stash for ordering safety.
      request.body =
        request.body.type === 'graphql'
          ? { ...request.body, variables: vars }
          : { type: 'graphql', content: '', variables: vars }
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

/**
 * Parse a Bruno `environments/<name>.bru` file. Bruno keeps env values in a
 * `vars { key: value }` block. The sibling `vars:secret [ name, … ]` list
 * declares secrets without values — we don't surface them, since Bruno itself
 * never serializes their values to disk.
 */
export function importBrunoEnvironment(text: string, name: string): TigerEnvironment {
  const blocks = tokenizeBrunoBlocks(text)
  const variables = blocks
    .filter((b) => b.name === 'vars' && !b.subtype)
    .flatMap((b) => parseKeyValues(b.content))
  return { name, variables }
}
