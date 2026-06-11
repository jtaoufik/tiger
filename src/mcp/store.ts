import { readdir, readFile } from 'node:fs/promises'
import { basename, join, relative } from 'node:path'
import { parseRequest } from '../core/tigerFormat'
import { parseEnvironment } from '../core/environment'
import { parseCollectionSettings } from '../core/collectionSettings'
import { interpolate, type VarMap } from '../core/interpolate'
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

export function createFsStore(root: string): CollectionStore {
  async function walk(dir: string, acc: RequestRef[]): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== ENVIRONMENTS_DIR && !entry.name.startsWith('.')) await walk(full, acc)
      } else if (entry.isFile() && entry.name.endsWith('.tiger')) {
        let name = basename(entry.name, '.tiger')
        try {
          name = parseRequest(await readFile(full, 'utf8')).name || name
        } catch {
          /* keep filename */
        }
        acc.push({ name, path: relative(root, full) })
      }
    }
  }

  async function listEnvironments(): Promise<EnvironmentRef[]> {
    const dir = join(root, ENVIRONMENTS_DIR)
    try {
      const out: EnvironmentRef[] = []
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.tiger')) {
          const env = parseEnvironment(await readFile(join(dir, entry.name), 'utf8'))
          out.push({ name: env.name || basename(entry.name, '.tiger'), path: join(ENVIRONMENTS_DIR, entry.name) })
        }
      }
      return out
    } catch {
      return []
    }
  }

  async function readCollectionAuth(): Promise<TigerAuth | undefined> {
    try {
      const text = await readFile(join(root, COLLECTION_FILE), 'utf8')
      return parseCollectionSettings(text).auth
    } catch {
      // No collection.tiger (or unreadable): the collection has no default auth.
      return undefined
    }
  }

  return {
    async listRequests() {
      const acc: RequestRef[] = []
      await walk(root, acc)
      return acc
    },
    readRequest: (path) => readFile(join(root, path), 'utf8'),
    readCollectionAuth,
    listEnvironments,
    async readEnvironment(name) {
      const ref = (await listEnvironments()).find((e) => e.name === name)
      if (!ref) return null
      return parseEnvironment(await readFile(join(root, ref.path), 'utf8'))
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

export function createNodeRunner(): HttpRunner {
  return {
    oauthToken: exchangeOAuthToken,
    async send(built, timeoutMs = 30000): Promise<RawResponse> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const started = Date.now()
      try {
        const res = await fetch(built.url, {
          method: built.method,
          headers: built.headers,
          body: built.body,
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
