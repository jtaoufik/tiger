import { readdir, readFile } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib'
import { readTextFile } from '../main/textFile'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parseRequest } from '../core/tigerFormat'
import { parseEnvironment } from '../core/environment'
import { parseCollectionSettings } from '../core/collectionSettings'
import { interpolate, type VarMap } from '../core/interpolate'
import { assembleMultipart, generateBoundary, type MultipartPart } from '../core/multipart'
import type { BuiltRequest } from '../core/request'
import type { RawResponse } from '../core/response'
import type { TigerAuth } from '../core/types'
import type {
  CollectionStore,
  EnvironmentRef,
  HttpRunner,
  RequestRef
} from './handlers'

const ENVIRONMENTS_DIR = 'environments'
const COLLECTION_FILE = 'collection.tiger'
const FOLDER_FILE = 'folder.tiger'

export function createFsStore(root: string): CollectionStore {
  /**
   * A path the AI client sent: relative to the collection, as list_requests
   * gives them. An absolute one, or one that leaves the collection (`../`), is
   * refused: an assistant steered by a page it read must not open other files,
   * and a parse error quotes the start of the file.
   */
  function inCollection(path: string): string {
    const full = resolve(root, path)
    const rel = relative(root, full)
    if (isAbsolute(path) || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new Error('the path must be relative to the collection folder and stay inside it')
    }
    return full
  }

  async function walk(dir: string, acc: RequestRef[]): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== ENVIRONMENTS_DIR && !entry.name.startsWith('.')) await walk(full, acc)
      } else if (entry.name === COLLECTION_FILE || entry.name === FOLDER_FILE) {
        // Collection and folder settings, not requests (as in src/main/collection.ts).
        continue
      } else if (entry.isFile() && entry.name.endsWith('.tiger')) {
        let name = basename(entry.name, '.tiger')
        try {
          name = parseRequest(await readTextFile(full)).name || name
        } catch {
          /* keep filename */
        }
        acc.push({ name, path: relative(root, full) })
      }
    }
  }

  async function listEnvironments(): Promise<EnvironmentRef[]> {
    const dir = join(root, ENVIRONMENTS_DIR)
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return []
    }
    const out: EnvironmentRef[] = []
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.tiger')) continue
      // One file Tiger cannot read hides only itself, as in the app's
      // readEnvironments, not every environment of the collection.
      try {
        const env = parseEnvironment(await readTextFile(join(dir, entry.name)))
        out.push({ name: env.name || basename(entry.name, '.tiger'), path: join(ENVIRONMENTS_DIR, entry.name) })
      } catch {
        /* skip the unreadable file */
      }
    }
    return out
  }

  async function readCollectionAuth(): Promise<TigerAuth | undefined> {
    try {
      const text = await readTextFile(join(root, COLLECTION_FILE))
      return parseCollectionSettings(text).auth
    } catch {
      // No collection.tiger (or unreadable): the collection has no default auth.
      return undefined
    }
  }

  async function readFolderAuth(folder: string[]): Promise<TigerAuth | undefined> {
    try {
      const text = await readTextFile(inCollection(join(...folder, FOLDER_FILE)))
      return parseCollectionSettings(text).auth
    } catch {
      // No folder.tiger (or unreadable): the folder has no default auth.
      return undefined
    }
  }

  return {
    async listRequests() {
      const acc: RequestRef[] = []
      await walk(root, acc)
      return acc
    },
    readRequest: async (path) => readTextFile(inCollection(path)),
    readCollectionAuth,
    readFolderAuth,
    listEnvironments,
    async readEnvironment(name) {
      const ref = (await listEnvironments()).find((e) => e.name === name)
      if (!ref) return null
      return parseEnvironment(await readTextFile(join(root, ref.path)))
    }
  }
}

/** Client-credentials token exchange, run with the global fetch in the runner. */
async function exchangeOAuthToken(
  auth: Extract<TigerAuth, { type: 'oauth2' }>,
  vars: VarMap
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: auth.grantType,
    client_id: interpolate(auth.clientId, vars),
    client_secret: interpolate(auth.clientSecret, vars)
  })
  if (auth.scope) body.append('scope', interpolate(auth.scope, vars))

  const res = await fetch(interpolate(auth.tokenUrl, vars), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })
  if (!res.ok) throw new Error(`Token endpoint returned ${res.status}`)
  const json = (await res.json()) as { access_token?: string }
  if (!json.access_token) throw new Error('Token response had no access_token')
  return json.access_token
}

/**
 * Headers and body as sent. multipart/form-data rows are assembled here, as
 * the app does at send time (src/main/http.ts): file rows are read from disk
 * and the Content-Type carries the generated boundary. A relative file path is
 * read from the collection folder, not from wherever the AI client started us.
 */
async function wireRequest(
  built: BuiltRequest,
  root: string | undefined
): Promise<{ headers: Record<string, string>; body?: string | Uint8Array }> {
  if (!built.multipart?.length) return { headers: built.headers, body: built.body }
  const parts: MultipartPart[] = await Promise.all(
    built.multipart.map(async (p) =>
      p.isFile
        ? {
            name: p.name,
            value: new Uint8Array(await readFile(resolve(root ?? '', p.value))),
            fileName: basename(p.value)
          }
        : { name: p.name, value: p.value }
    )
  )
  const { bytes, contentType } = assembleMultipart(parts, generateBoundary())
  const headers = { ...built.headers }
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === 'content-type') delete headers[k]
  }
  headers['Content-Type'] = contentType
  return { headers, body: bytes }
}

/** Sends requests with Node's fetch. `root` is the collection folder, for relative file paths. */
/** One request through node:http(s), for what fetch refuses; the response is decoded like fetch does. */
function sendRaw(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | Uint8Array,
  signal: AbortSignal
): Promise<Omit<RawResponse, 'timeMs'>> {
  return new Promise((done, failed) => {
    const send = url.startsWith('https:') ? httpsRequest : httpRequest
    // Node frames no GET body by itself: without a length the server reads
    // the body as a second, broken request.
    const length = typeof body === 'string' ? Buffer.byteLength(body) : body.byteLength
    const req = send(url, { method, headers: { ...headers, 'Content-Length': String(length) }, signal }, (res) => {
      const decode =
        res.headers['content-encoding'] === 'gzip'
          ? createGunzip()
          : res.headers['content-encoding'] === 'deflate'
            ? createInflate()
            : res.headers['content-encoding'] === 'br'
              ? createBrotliDecompress()
              : null
      const stream = decode ? res.pipe(decode) : res
      const chunks: Buffer[] = []
      stream.on('data', (c: Buffer) => chunks.push(c))
      stream.on('error', failed)
      stream.on('end', () => {
        const out: Record<string, string> = {}
        for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) out[k] = Array.isArray(v) ? v.join(', ') : v
        done({
          status: res.statusCode ?? 0,
          statusText: res.statusMessage ?? '',
          headers: out,
          body: Buffer.concat(chunks).toString('utf8')
        })
      })
    })
    req.on('error', failed)
    req.end(body)
  })
}

export function createNodeRunner(root?: string): HttpRunner {
  return {
    oauthToken: exchangeOAuthToken,
    async send(built, timeoutMs = 30000): Promise<RawResponse> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const started = Date.now()
      try {
        const { headers: sentHeaders, body: sentBody } = await wireRequest(built, root)
        // fetch refuses a body on GET or HEAD, which some APIs read
        // (Elasticsearch searches): those go out through node:http(s).
        if (sentBody !== undefined && /^(GET|HEAD)$/i.test(built.method)) {
          return { ...(await sendRaw(built.url, built.method, sentHeaders, sentBody, controller.signal)), timeMs: Date.now() - started }
        }
        const res = await fetch(built.url, {
          method: built.method,
          headers: sentHeaders,
          // A Uint8Array is a valid body; TS's BodyInit just doesn't know it.
          body: sentBody as BodyInit | undefined,
          signal: controller.signal
        })
        const body = await res.text()
        const headers: Record<string, string> = {}
        res.headers.forEach((value, key) => {
          headers[key] = value
        })
        return {
          status: res.status,
          statusText: res.statusText,
          headers,
          body,
          timeMs: Date.now() - started
        }
      } finally {
        clearTimeout(timer)
      }
    }
  }
}
