import { describe, it, expect, vi, beforeEach } from 'vitest'

// A virtual filesystem backing the mocked node:fs, reset per test.
let files: Record<string, string>
let encryptionOn = true

vi.mock('electron', () => ({
  app: { getPath: () => '/userData' },
  safeStorage: {
    isEncryptionAvailable: () => encryptionOn,
    // Reversible fake "encryption": tag + reverse so round-trips are verifiable.
    encryptString: (s: string) => Buffer.from('ENC:' + s, 'utf8'),
    decryptString: (b: Buffer) => {
      const raw = b.toString('utf8')
      if (!raw.startsWith('ENC:')) throw new Error('bad ciphertext')
      return raw.slice(4)
    }
  }
}))

const fsMock = {
  existsSync: (p: string) => p in files,
  readFileSync: (p: string) => {
    if (!(p in files)) throw new Error('ENOENT')
    return files[p]
  },
  writeFileSync: (p: string, data: string) => {
    if (diskFull) throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' })
    files[p] = data
  },
  // The atomic write goes through a temporary file renamed into place.
  renameSync: (from: string, to: string) => {
    if (!(from in files)) throw new Error('ENOENT')
    files[to] = files[from]
    delete files[from]
  },
  unlinkSync: (p: string) => {
    delete files[p]
  }
}
vi.mock('node:fs', () => ({ ...fsMock, default: fsMock }))
let diskFull = false
const logged = vi.hoisted(() => ({ calls: [] as unknown[][] }))
vi.mock('../../src/main/resilience', () => ({
  logMainError: (...args: unknown[]) => {
    logged.calls.push(args)
  }
}))

const PATH = '/userData/settings.json'

async function freshLoad() {
  vi.resetModules()
  return await import('../../src/main/settings')
}

beforeEach(() => {
  files = {}
  encryptionOn = true
  diskFull = false
  logged.calls = []
})

describe('a profile folder that cannot be written', () => {
  it('loads defaults on first run and saves in memory without throwing; the failure is logged', async () => {
    diskFull = true
    const { loadSettings, saveSettings } = await freshLoad()
    expect(() => loadSettings()).not.toThrow()
    expect(loadSettings().timeoutMs).toBe(30000)
    expect(() => saveSettings({ fontSize: 15 })).not.toThrow()
    expect(loadSettings().fontSize).toBe(15)
    expect(files[PATH]).toBeUndefined()
    expect(Object.keys(files).filter((f) => f.endsWith('.tmp'))).toEqual([])
    expect(logged.calls.length).toBeGreaterThanOrEqual(2)
    expect(logged.calls[0][0]).toBe('settings')
  })

  it('writes through a temporary file, leaving none behind on success', async () => {
    const { saveSettings } = await freshLoad()
    saveSettings({ fontSize: 16 })
    expect(JSON.parse(files[PATH]).fontSize).toBe(16)
    expect(Object.keys(files)).toEqual([PATH])
  })
})

describe('loadSettings parse-error handling', () => {
  it('does NOT overwrite a corrupt existing file (data loss guard)', async () => {
    files[PATH] = '{ this is not valid json'
    const { loadSettings } = await freshLoad()
    const s = loadSettings()
    // defaults used in memory
    expect(s.theme).toBe('system')
    // file left intact, never replaced with defaults
    expect(files[PATH]).toBe('{ this is not valid json')
  })

  it('writes defaults only when the file does not exist', async () => {
    const { loadSettings } = await freshLoad()
    loadSettings()
    expect(files[PATH]).toBeDefined()
    expect(JSON.parse(files[PATH]).theme).toBe('system')
  })
})

describe('secrets at rest', () => {
  it('encrypts certPassphrase and proxyPassword on disk, plaintext in memory', async () => {
    const { saveSettings } = await freshLoad()
    const result = saveSettings({ certPassphrase: 'pfxpw', proxyPassword: 'proxypw' })
    // renderer-facing (return value / in-memory) stays plaintext
    expect(result.certPassphrase).toBe('pfxpw')
    expect(result.proxyPassword).toBe('proxypw')
    // on disk they are marked + encrypted, never plaintext
    const onDisk = JSON.parse(files[PATH])
    expect(onDisk.certPassphrase.startsWith('safestore:v1:')).toBe(true)
    expect(onDisk.proxyPassword.startsWith('safestore:v1:')).toBe(true)
    expect(onDisk.certPassphrase).not.toContain('pfxpw')
  })

  it('round-trips: a fresh load decrypts secrets back to plaintext', async () => {
    const first = await freshLoad()
    first.saveSettings({ certPassphrase: 'topsecret', proxyPassword: 'hunter2' })
    // simulate a restart: cache cleared via resetModules, file persists
    const second = await freshLoad()
    const s = second.loadSettings()
    expect(s.certPassphrase).toBe('topsecret')
    expect(s.proxyPassword).toBe('hunter2')
  })

  it('stores plaintext (current behavior) and never crashes when encryption unavailable', async () => {
    encryptionOn = false
    const { saveSettings } = await freshLoad()
    saveSettings({ certPassphrase: 'plainpw' })
    const onDisk = JSON.parse(files[PATH])
    expect(onDisk.certPassphrase).toBe('plainpw')
  })

  it('non-secret fields are written verbatim', async () => {
    const { saveSettings } = await freshLoad()
    saveSettings({ proxyUrl: 'http://proxy:8080' })
    const onDisk = JSON.parse(files[PATH])
    expect(onDisk.proxyUrl).toBe('http://proxy:8080')
  })
})
