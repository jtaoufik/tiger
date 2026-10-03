import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CodePane } from '../../src/renderer/src/components/CodePane'
import type { BuiltRequest } from '../../src/core/request'

const built: BuiltRequest = {
  method: 'POST',
  url: 'https://api.test/users?a=1&b=2',
  headers: { 'Content-Type': 'application/json' },
  body: '{"name":"Ada"}'
}

describe('Code tab', () => {
  it('offers curl for Windows cmd, quoted the way cmd.exe reads it', () => {
    render(<CodePane getBuilt={() => built} />)
    fireEvent.click(screen.getByRole('button', { name: 'curl (Windows cmd)' }))
    const code = screen.getByRole('region', { name: 'Generated curl (Windows cmd) code' }).textContent ?? ''
    expect(code.startsWith('curl.exe -X POST ^"https://api.test/users?a=1^&b=2^"')).toBe(true)
    expect(code).toContain('--data-raw ^"^{^\\^"name^\\^":^\\^"Ada^\\^"^}^"')
  })

  it('still opens on curl for a POSIX shell', () => {
    render(<CodePane getBuilt={() => built} />)
    expect(screen.getByRole('button', { name: 'curl' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('region', { name: 'Generated curl code' }).textContent).toContain(
      "curl -X POST 'https://api.test/users?a=1&b=2'"
    )
  })
})
