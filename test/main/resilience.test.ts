import { describe, expect, it } from 'vitest'
import { CrashLoop, formatLogLine } from '../../src/main/resilience'

describe('formatLogLine', () => {
  it('writes the time, the context, the message and an indented stack', () => {
    const err = new Error('boom')
    err.stack = 'Error: boom\n    at here'
    const line = formatLogLine('uncaughtException', err, new Date('2026-01-02T03:04:05.000Z'))
    expect(line).toBe('2026-01-02T03:04:05.000Z [uncaughtException] boom\n    Error: boom\n        at here\n')
  })

  it('takes a rejection reason that is not an Error', () => {
    const at = new Date(0)
    expect(formatLogLine('unhandledRejection', 'plain text', at)).toBe('1970-01-01T00:00:00.000Z [unhandledRejection] plain text\n')
    expect(formatLogLine('unhandledRejection', { code: 'EIO' }, at)).toBe('1970-01-01T00:00:00.000Z [unhandledRejection] {"code":"EIO"}\n')
    expect(formatLogLine('unhandledRejection', undefined, at)).toBe('1970-01-01T00:00:00.000Z [unhandledRejection] undefined\n')
  })

  it('never throws on a value JSON cannot serialize', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(formatLogLine('x', cyclic, new Date(0))).toContain('[object Object]')
    expect(formatLogLine('x', 10n, new Date(0))).toContain('10')
  })
})

describe('CrashLoop', () => {
  it('counts crashes inside the window and forgets older ones', () => {
    const loop = new CrashLoop(60_000)
    expect(loop.record(0)).toBe(1)
    expect(loop.record(10_000)).toBe(2)
    expect(loop.record(20_000)).toBe(3)
    // 70 s later only the crashes of the last minute count.
    expect(loop.record(70_001)).toBe(2)
    expect(loop.record(200_000)).toBe(1)
  })
})
