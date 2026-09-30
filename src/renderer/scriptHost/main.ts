/**
 * Entry of the isolated script host page (script-host.html). It exposes exactly
 * one function, which the main process calls with a plain-JSON job through
 * webContents.executeJavaScript and whose plain-JSON result it reads back.
 *
 * Defence in depth on top of the process sandbox, the CSP and the session-level
 * network block set up in src/main/scriptHost.ts: drop the network and
 * sub-context constructors from this realm before any script can run.
 */
import { executeJob } from '@core/scriptProtocol'

const g = globalThis as unknown as Record<string, unknown>
const blocked = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'WebTransport',
  'EventSource',
  'RTCPeerConnection',
  'webkitRTCPeerConnection',
  'RTCDataChannel',
  'Worker',
  'SharedWorker',
  'BroadcastChannel',
  'open',
  'indexedDB',
  'caches'
]
for (const name of blocked) {
  try {
    Object.defineProperty(g, name, {
      value: undefined,
      writable: false,
      configurable: false
    })
  } catch {
    try {
      delete g[name]
    } catch {
      /* not configurable in this engine: CSP and the session block still apply */
    }
  }
}
try {
  Object.defineProperty(navigator, 'sendBeacon', {
    value: undefined,
    configurable: false
  })
} catch {
  /* CSP connect-src 'none' covers beacons */
}

// Non-writable and non-configurable so a script cannot replace the entry point
// that later jobs go through.
Object.defineProperty(g, '__tigerRunScript', {
  value: (job: unknown) => executeJob(job),
  writable: false,
  configurable: false,
  enumerable: false
})
Object.defineProperty(g, '__tigerScriptHostReady', {
  value: true,
  writable: false,
  configurable: false,
  enumerable: false
})
