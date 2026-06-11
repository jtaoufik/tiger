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
    files[p] = data
  }
}
vi.mock('node:fs', () => ({ ...fsMock, default: fsMock }))

const PATH = '/userData/settings.json'

async function freshLoad() {
  vi.resetModules()
  return await import('../../src/main/settings')
}

beforeEach(() => {
  files = {}
  encryptionOn = true
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
