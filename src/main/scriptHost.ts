/**
 * The isolated script host: where collection pre-request and post-response
 * scripts actually run in the desktop app.
 *
 * Scripts come from collections, including imported third-party ones. The app
 * window cannot eval (its CSP has no 'unsafe-eval', on purpose) and holds
 * `window.tiger` with file and repository IPC, so scripts never run there.
 * Instead each job goes app window -> main (ipc 'tiger:script:run') -> a hidden
 * BrowserWindow that:
 *   - is sandboxed, context-isolated, has no Node integration and NO preload,
 *     so the page has no Electron or Node API at all and cannot send IPC;
 *   - loads script-host.html, whose own CSP allows 'unsafe-eval' but
 *     connect-src 'none' and default-src 'none';
 *   - lives in its own in-memory session whose every request other than the
 *     host page's own files is cancelled, whose permission prompts are denied,
 *     and whose WebRTC may not use non-proxied UDP;
 *   - cannot navigate or open windows.
 * Main talks to the page with webContents.executeJavaScript, passing the job as
 * a JSON literal and reading back a plain object. The job and the result are
 * validated and bounded in src/core/scriptProtocol.ts. A script that does not
 * finish in time (e.g. an infinite loop) gets its host process killed; the next
 * job spawns a fresh one.
 *
 * Alternatives considered: a Web Worker spawned by the app window would be
 * simpler, but it shares the app's renderer process, its CSP for a file:// URL
 * is not the page's, and network isolation would rest on deleting globals in
 * JS. webFrame isolated worlds share the app's process and CSP. A separate
 * sandboxed process with no preload gets its isolation from Chromium, and
 * killing it is a reliable stop for a synchronous infinite loop.
 *
 * Known limit: one host serves consecutive jobs, so a hostile script could
 * tamper with the host realm (e.g. prototypes) and skew the results of later
 * scripts. It still cannot reach files, IPC or the network.
 */
import { BrowserWindow, session, type Session } from 'electron'
import { join } from 'node:path'
import { createScriptHostQueue, type ScriptHost, type ScriptHostQueue } from '../core/scriptProtocol'
import { markHelperWindow } from './windows'

const PARTITION = 'tiger-script-host'

function hostUrl(): string | null {
  const dev = process.env.ELECTRON_RENDERER_URL
  return dev ? `${dev.replace(/\/$/, '')}/script-host.html` : null
}

let sessionReady: Session | null = null

function hostSession(): Session {
  if (sessionReady) return sessionReady
  const ses = session.fromPartition(PARTITION, { cache: false })
  const dev = process.env.ELECTRON_RENDERER_URL
  const devOrigin = dev ? new URL(dev).origin : null
  // Only the host page's own files may load. Everything else (http, ws, other
  // schemes) is cancelled before it leaves the process.
  ses.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url
    const allowed =
      url.startsWith('file://') ||
      url.startsWith('devtools://') ||
      (devOrigin !== null && url.startsWith(`${devOrigin}/`) && !/^wss?:/.test(url))
    callback({ cancel: !allowed })
  })
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  ses.setPermissionCheckHandler(() => false)
  sessionReady = ses
  return ses
}

function spawnHost(): ScriptHost {
  const win = new BrowserWindow({
    show: false,
    width: 200,
    height: 200,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webgl: false,
      plugins: false,
      spellcheck: false,
      enableWebSQL: false,
      backgroundThrottling: false,
      session: hostSession()
      // No preload: the page gets no bridge of any kind.
    }
  })
  markHelperWindow(win)
  const wc = win.webContents
  wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  wc.on('will-navigate', (e) => e.preventDefault())
  wc.on('will-redirect', (e) => e.preventDefault())

  let dead = false
  let rejectPending: ((e: Error) => void) | null = null
  wc.on('render-process-gone', (_e, details) => {
    dead = true
    rejectPending?.(new Error(`script host stopped (${details.reason})`))
  })

  const ready = new Promise<void>((resolve, reject) => {
    wc.once('did-finish-load', () => resolve())
    wc.once('did-fail-load', (_e, code, desc) =>
      reject(new Error(`script host failed to load: ${desc} (${code})`))
    )
  })
  const url = hostUrl()
  const loading = url ? win.loadURL(url) : win.loadFile(join(__dirname, '../renderer/script-host.html'))
  loading.catch(() => {
    /* surfaced through `ready` */
  })

  return {
    async run(job) {
      await ready
      if (dead || win.isDestroyed()) throw new Error('script host is not running')
      // The job is data: JSON.stringify yields a single expression literal, so
      // nothing in it is evaluated as code by this call. The page evaluates only
      // job.source, inside its own sandbox.
      const call = `globalThis.__tigerRunScript(${JSON.stringify(job)})`
      return await new Promise<unknown>((resolve, reject) => {
        rejectPending = reject
        wc.executeJavaScript(call).then(resolve, reject)
      }).finally(() => {
        rejectPending = null
      })
    },
    kill() {
      dead = true
      if (win.isDestroyed()) return
      try {
        wc.forcefullyCrashRenderer()
      } catch {
        /* process already gone */
      }
      win.destroy()
    }
  }
}

let queue: ScriptHostQueue | null = null

/** Run one script job in the isolated host. Never throws. */
export function runIsolatedScript(job: unknown): ReturnType<ScriptHostQueue['run']> {
  queue ??= createScriptHostQueue(spawnHost)
  return queue.run(job)
}

/** Tear the host down (app window closed, app quitting). */
export function disposeScriptHost(): void {
  queue?.dispose()
}
