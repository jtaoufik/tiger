import { describe, expect, it } from 'vitest'
import { compareVersions, isNewerVersion } from '../../src/core/version'

describe('compareVersions', () => {
  it('orders by major, minor, patch', () => {
    expect(compareVersions('1.0.0', '0.9.9')).toBe(1)
    expect(compareVersions('0.2.0', '0.10.0')).toBe(-1)
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })

  it('treats missing segments as zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('1', '1.0.1')).toBe(-1)
  })

  it('ignores a leading v prefix', () => {
    expect(compareVersions('v1.1.0', '1.0.9')).toBe(1)
  })
})

describe('isNewerVersion', () => {
  it('is true only when latest is strictly greater', () => {
    expect(isNewerVersion('0.2.0', '0.1.0')).toBe(true)
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false)
    expect(isNewerVersion('0.0.9', '0.1.0')).toBe(false)
  })

  it('rejects garbage input instead of prompting an update', () => {
    expect(isNewerVersion('not-a-version', '0.1.0')).toBe(false)
    expect(isNewerVersion('', '0.1.0')).toBe(false)
  })
})

describe('pre-release versions', () => {
  it('orders a release above its pre-releases, and pre-releases as semver does', () => {
    expect(compareVersions('1.0.0', '1.0.0-rc.1')).toBe(1)
    expect(compareVersions('1.0.0-rc.1', '1.0.0')).toBe(-1)
    expect(compareVersions('1.0.0-rc.1', '0.9.0')).toBe(1)
    expect(compareVersions('1.0.0-alpha', '1.0.0-alpha.1')).toBe(-1)
    expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBe(-1)
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.11')).toBe(-1)
    expect(compareVersions('1.0.0-rc.1', '1.0.0-rc.1')).toBe(0)
    expect(compareVersions('1.0.0+build.5', '1.0.0')).toBe(0)
  })

  it('offers the final release to someone on a pre-release, and a newer pre-release to anyone', () => {
    expect(isNewerVersion('1.0.0', '1.0.0-rc.1')).toBe(true)
    expect(isNewerVersion('v1.0.0-rc.2', '1.0.0-rc.1')).toBe(true)
    expect(isNewerVersion('1.0.0-rc.1', '1.0.0')).toBe(false)
    expect(isNewerVersion('1.0.0-rc.1', '0.9.0')).toBe(true)
  })
})
