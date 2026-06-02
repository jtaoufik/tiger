import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
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
  proxyEnabled: boolean
  proxyUrl: string

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
    proxyEnabled: false,
    proxyUrl: '',
    analyticsEnabled: true,
    clientId: randomUUID()
  }
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

let cache: Settings | null = null

export function loadSettings(): Settings {
  if (cache) return cache
  let loaded: Settings
  try {
    loaded = { ...defaults(), ...JSON.parse(readFileSync(settingsPath(), 'utf8')) }
  } catch {
    loaded = defaults()
    persist(loaded)
  }
  cache = loaded
  return loaded
}

function persist(settings: Settings): void {
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8')
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch }
  cache = next
  persist(next)
  return next
}
