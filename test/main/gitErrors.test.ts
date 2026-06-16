import { describe, expect, it } from 'vitest'
import { translateGitError } from '../../src/main/git'

describe('translateGitError', () => {
  it('explains the GIT_TERMINAL_PROMPT=0 credential failure for private HTTPS clones', () => {
    const stderr = "fatal: could not read Username for 'https://github.com': terminal prompts disabled"
    expect(translateGitError(stderr, 'Clone failed')).toMatch(/Authentication required/)
  })

  it('points SSH key failures at ssh-agent', () => {
    const stderr =
      'git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.'
    expect(translateGitError(stderr, 'Clone failed')).toMatch(/SSH key/)
  })

  it('flags a bad PAT as an authentication failure', () => {
    const stderr = 'remote: Invalid username or password.\nfatal: Authentication failed'
    expect(translateGitError(stderr, 'Push failed')).toMatch(/Authentication failed/)
  })

  it('flags a missing repository', () => {
    const stderr = 'remote: Repository not found.\nfatal: repository not found'
    expect(translateGitError(stderr, 'Clone failed')).toMatch(/Repository not found/)
  })

  it('flags a network/DNS failure', () => {
    const stderr = "fatal: unable to access 'https://x.invalid/': Could not resolve host: x.invalid"
    expect(translateGitError(stderr, 'Clone failed')).toMatch(/Could not reach the host/)
  })

  it('falls back to the caller-supplied message when nothing matches', () => {
    expect(translateGitError('fatal: something weird', 'Clone failed')).toBe('Clone failed')
  })
})
