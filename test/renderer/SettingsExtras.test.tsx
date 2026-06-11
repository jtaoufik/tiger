import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SettingsView } from '../../src/renderer/src/components/SettingsView'
import type { Settings } from '../../src/main/settings'

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false
  })) as unknown as typeof window.matchMedia
})

beforeEach(() => {
  document.body.innerHTML = ''
})

const fallbackSettings: Settings = {
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
  clientId: 'test-client-id'
}

describe('SettingsView extras', () => {
  it('renders the MCP tab', () => {
    render(<SettingsView settings={fallbackSettings} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'MCP' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'MCP' }))
    expect(screen.getByText(/MCP server/i)).toBeInTheDocument()
  })

  it('renders the Certificates group inside the Advanced tab', () => {
    render(<SettingsView settings={fallbackSettings} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    expect(screen.getByTestId('certificates-group')).toBeInTheDocument()
    expect(screen.getByText('CA bundle (PEM)')).toBeInTheDocument()
    expect(screen.getByText('Client certificate (PEM)')).toBeInTheDocument()
    expect(screen.getByText('Client key (PEM)')).toBeInTheDocument()
    expect(screen.getByText('PFX / P12 bundle')).toBeInTheDocument()
  })

  it('renders the cookie jar toggle in the Network tab', () => {
    render(<SettingsView settings={fallbackSettings} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Network' }))
    expect(screen.getByText('Persistent cookie jar')).toBeInTheDocument()
    expect(screen.getByText('Clear cookies')).toBeInTheDocument()
  })

  it('cookie jar toggle calls onChange with cookieJarEnabled flipped', () => {
    const onChange = vi.fn()
    render(<SettingsView settings={fallbackSettings} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Network' }))
    const cookieRow = screen.getByText('Persistent cookie jar').closest('.setting-row')!
    const toggle = cookieRow.querySelector('.switch')!
    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith({ cookieJarEnabled: false })
  })

  it('clear cookies button label flips to Cleared when tiger.clearCookies resolves', async () => {
    const clearCookies = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window, 'tiger', {
      value: { clearCookies, mcpInfo: vi.fn().mockResolvedValue({ serverPath: '/tmp/server.mjs' }) },
      writable: true,
      configurable: true
    })

    render(<SettingsView settings={fallbackSettings} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Network' }))
    fireEvent.click(screen.getByText('Clear cookies'))
    expect(await screen.findByText('Cleared')).toBeInTheDocument()

    // restore
    Object.defineProperty(window, 'tiger', { value: undefined, writable: true, configurable: true })
  })

  it('MCP tab shows a code block with the server snippet when mcpInfo resolves', async () => {
    const mcpInfo = vi.fn().mockResolvedValue({ serverPath: '/abs/path/to/server.mjs' })
    Object.defineProperty(window, 'tiger', {
      value: { mcpInfo },
      writable: true,
      configurable: true
    })

    render(<SettingsView settings={fallbackSettings} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'MCP' }))
    const codeBlock = await screen.findByText((content) =>
      content.includes('/abs/path/to/server.mjs')
    )
    expect(codeBlock).toBeInTheDocument()
    expect(codeBlock.textContent).toContain('"command": "node"')

    Object.defineProperty(window, 'tiger', { value: undefined, writable: true, configurable: true })
  })
})
