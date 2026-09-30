import { session } from 'electron'

/**
 * End-to-end runs (TIGER_E2E=1, set only by the Playwright suite in e2e/) must
 * be hermetic: the update check, analytics and any stray fetch never leave the
 * machine, and an "update available" dialog can never pop over the UI under
 * test. Requests to loopback hosts and local files still go through, so the
 * suite's own HTTP server keeps working.
 */
export function isE2E(): boolean {
  return process.env.TIGER_E2E === '1'
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export function isLoopbackOrLocal(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (!/^(https?|wss?):$/.test(parsed.protocol)) return true
  return LOOPBACK.has(parsed.hostname)
}

export function blockExternalNetwork(): void {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isLoopbackOrLocal(details.url) })
  })
}
