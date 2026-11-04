/**
 * Keeps one failure from taking the whole app down.
 *
 * - An uncaught exception or an unhandled rejection in the main process is
 *   logged to <userData>/logs/main.log and the app carries on. Without a
 *   handler, Electron shows "A JavaScript error occurred in the main process"
 *   over the window, which reads as a crash.
 * - A renderer that dies (out of memory on a huge response, a GPU fault) is
 *   reloaded in place: the window used to stay blank until Tiger was quit.
 *   A renderer that keeps dying gets a dialog instead of a reload loop.
 * - A renderer that stops answering gets a Wait / Reload dialog; the OS alone
 *   only greys the window out.
 */
import { app, dialog, type BrowserWindow, type RenderProcessGoneDetails } from 'electron'
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { mainT } from './i18n'

/** Rotate the log once it passes this size; one older copy is kept. */
export const MAX_LOG_BYTES = 1_000_000

/** One log line: time, where it happened, the message and the stack (when any). */
export function formatLogLine(context: string, error: unknown, at: Date = new Date()): string {
  const err = error instanceof Error ? error : null
  const message = err ? err.message : safeString(error)
  const stack = err?.stack && err.stack !== message ? `\n${indent(err.stack)}` : ''
  return `${at.toISOString()} [${context}] ${message}${stack}\n`
}

function safeString(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((l) => `    ${l}`)
    .join('\n')
}

/**
 * Counts crashes inside a sliding window: `record` returns how many happened
 * in the last `windowMs`, the one just recorded included. Pure, for tests.
 */
export class CrashLoop {
  private readonly times: number[] = []
  constructor(private readonly windowMs = 60_000) {}

  record(now: number = Date.now()): number {
    this.times.push(now)
    while (this.times.length && now - this.times[0] > this.windowMs) this.times.shift()
    return this.times.length
  }
}

let logFile: string | null = null

function resolveLogFile(): string | null {
  if (logFile) return logFile
  try {
    logFile = join(app.getPath('userData'), 'logs', 'main.log')
  } catch {
    return null
  }
  return logFile
}

/** Where errors are written; the dialogs name it so people can find it. */
export function mainLogPath(): string {
  return resolveLogFile() ?? ''
}

/** Append one error to the log. Never throws: a logging failure must not become a second error. */
export function logMainError(context: string, error: unknown): void {
  const line = formatLogLine(context, error)
  if (!app.isPackaged) console.error(line.trimEnd())
  const file = resolveLogFile()
  if (!file) return
  try {
    mkdirSync(dirname(file), { recursive: true })
    try {
      if (statSync(file).size > MAX_LOG_BYTES) renameSync(file, `${file}.1`)
    } catch {
      /* no log yet */
    }
    appendFileSync(file, line, 'utf8')
  } catch {
    /* a read-only profile folder: the console line above is all there is */
  }
}

/** Process-wide handlers. Call once, before anything async starts. */
export function installCrashGuards(): void {
  process.on('uncaughtException', (error) => logMainError('uncaughtException', error))
  process.on('unhandledRejection', (reason) => logMainError('unhandledRejection', reason))
  app.on('child-process-gone', (_e, details) => {
    // The GPU or a utility process went away; Chromium restarts those itself.
    if (details.reason !== 'clean-exit' && details.reason !== 'killed') {
      logMainError('child-process-gone', `${details.type}: ${details.reason} (exit code ${details.exitCode})`)
    }
  })
}

const EXPECTED_EXITS = new Set<RenderProcessGoneDetails['reason']>(['clean-exit', 'killed'])

/**
 * Recovery for one app window. `interactive` is false in automated runs,
 * where a dialog would wait forever for a person.
 */
export function guardWindow(win: BrowserWindow, interactive = true): void {
  const crashes = new CrashLoop()
  const wc = win.webContents

  wc.on('render-process-gone', (_e, details) => {
    if (EXPECTED_EXITS.has(details.reason) || win.isDestroyed()) return
    logMainError('render-process-gone', `${details.reason} (exit code ${details.exitCode})`)
    if (crashes.record() < 3 || !interactive) {
      wc.reload()
      return
    }
    void dialog
      .showMessageBox(win, {
        type: 'error',
        message: mainT('main.dialog.crashLoopTitle'),
        detail: mainT('main.dialog.crashLoopDetail', { path: mainLogPath() }),
        buttons: [mainT('main.dialog.reload'), mainT('main.dialog.quit')],
        defaultId: 0,
        cancelId: 0
      })
      .then(({ response }) => {
        if (win.isDestroyed()) return
        if (response === 0) wc.reload()
        else app.quit()
      })
      .catch(() => {
        /* the window went away under the dialog */
      })
  })

  let asking = false
  win.on('unresponsive', () => {
    logMainError('unresponsive', 'the window stopped answering')
    if (!interactive || asking || win.isDestroyed()) return
    asking = true
    void dialog
      .showMessageBox(win, {
        type: 'warning',
        message: mainT('main.dialog.unresponsiveTitle'),
        detail: mainT('main.dialog.unresponsiveDetail'),
        buttons: [mainT('main.dialog.wait'), mainT('main.dialog.reload')],
        defaultId: 0,
        cancelId: 0
      })
      .then(({ response }) => {
        if (response === 1 && !win.isDestroyed()) wc.forcefullyCrashRenderer()
      })
      .catch(() => {
        /* the window went away under the dialog */
      })
      .finally(() => {
        asking = false
      })
  })
  // The forced crash above lands in render-process-gone with reason 'crashed'
  // and is reloaded there, so Reload and a real crash take the same path.
}
