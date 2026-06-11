import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export type ThemeChoice = 'light' | 'dark' | 'system'

export interface Settings {
  theme: ThemeChoice
  timeoutMs: number
  fontSize: number

  // Network / advanced
  followRedirects: boolean
  maxRedirects: number
  sslVerify: boolean
  /** Comma-separated hostnames where invalid certificates are accepted. */
  certExceptions: string
  /** Path to a PEM CA bundle used to verify servers (custom/internal CAs). */
  caFile: string
  /** Client certificate: PEM cert + key, or a PFX/P12 bundle. */
  clientCertFile: string
  clientKeyFile: string
  clientPfxFile: string
  certPassphrase: string
  /** Persist cookies between sends and sessions. */
  cookieJarEnabled: boolean
  proxyEnabled: boolean
  proxyUrl: string
  /** Credentials answered to proxy 407 challenges; blank username = no auth. */
  proxyUsername: string
  proxyPassword: string
  /** When a server requests a client certificate, pick the one whose subject contains this text. */
  clientCertSubject: string

  // Analytics (anonymous, on by default; toggle off any time)
  analyticsEnabled: boolean
  clientId: string
  measurementId?: string
  apiSecret?: string
}

function defaults(): Settings {
  return {
    theme: 'system',
    timeoutMs: 30000,
    fontSize: 13,
    followRedirects: true,
    maxRedirects: 5,
    sslVerify: true,
    certExceptions: '',
    caFile: '',
    clientCertFile: '',
    clientKeyFile: '',
    clientPfxFile: '',
    certPassphrase: '',
    cookieJarEnabled: true,
    proxyEnabled: false,
    proxyUrl: '',
    proxyUsername: '',
    proxyPassword: '',
    clientCertSubject: '',
    analyticsEnabled: true,
    clientId: randomUUID()
  }
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

/** Fields encrypted at rest via electron safeStorage when available. */
const SECRET_FIELDS = ['certPassphrase', 'proxyPassword'] as const

/** Marker on a stored value that has been safeStorage-encrypted + base64'd. */
const ENC_PREFIX = 'safestore:v1:'

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

/** Encrypt a plaintext secret to a marked base64 string; passthrough on any failure. */
function encryptSecret(plain: string): string {
  if (!plain) return plain
  if (plain.startsWith(ENC_PREFIX)) return plain
  if (!encryptionAvailable()) return plain
  try {
    return ENC_PREFIX + safeStorage.encryptString(plain).toString('base64')
  } catch {
    return plain
  }
}

/** Decrypt a marked secret back to plaintext; passthrough when unmarked/unavailable. */
function decryptSecret(stored: string): string {
  if (!stored || !stored.startsWith(ENC_PREFIX)) return stored
  try {
    const b64 = stored.slice(ENC_PREFIX.length)
    return safeStorage.decryptString(Buffer.from(b64, 'base64'))
  } catch {
    // Can't decrypt (key rotated / different machine): surface empty rather
    // than the ciphertext so the renderer never shows garbage.
    return ''
  }
}

let cache: Settings | null = null

export function loadSettings(): Settings {
  if (cache) return cache
  let loaded: Settings
  if (!existsSync(settingsPath())) {
    // First run: materialize defaults on disk.
    loaded = defaults()
    persist(loaded)
  } else {
    try {
      const parsed = { ...defaults(), ...JSON.parse(readFileSync(settingsPath(), 'utf8')) } as Settings
      // Decrypt secrets so the renderer always sees plaintext via getSettings.
      for (const field of SECRET_FIELDS) {
        if (typeof parsed[field] === 'string') parsed[field] = decryptSecret(parsed[field])
      }
      loaded = parsed
    } catch {
      // Existing file is unreadable/corrupt: use defaults in memory but DO NOT
      // overwrite the file — the user's real settings may be recoverable.
      loaded = defaults()
    }
  }
  cache = loaded
  return loaded
}

function persist(settings: Settings): void {
  // Encrypt secrets at rest; everything else is written verbatim. The in-memory
  // cache keeps plaintext so getSettings stays plaintext for the renderer.
  const onDisk: Settings = { ...settings }
  for (const field of SECRET_FIELDS) {
    if (typeof onDisk[field] === 'string') onDisk[field] = encryptSecret(onDisk[field])
  }
  writeFileSync(settingsPath(), JSON.stringify(onDisk, null, 2), 'utf8')
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch }
  cache = next
  persist(next)
  return next
}
