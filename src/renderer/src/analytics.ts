/**
 * Firebase Analytics (project tiger-api-client). Events flow to the app's own
 * GA4 property; the user toggle in Settings gates everything. Event shapes
 * come from core/analytics so the privacy rules (no URLs, no headers, no
 * bodies, bucketed status codes) hold here too.
 *
 * The Firebase SDK (~200 KB of JavaScript) is imported on demand by
 * initAnalytics, which App calls only after the persisted opt-in resolves to
 * "on". It is never on the startup path, and never loaded for people who
 * opted out.
 */
import type { Analytics } from 'firebase/analytics'
import type { AnalyticsEvent } from '@core/analytics'

const firebaseConfig = {
  apiKey: 'AIzaSyCHRaShrq7p5pjh1QI8V3Iy56pQDoRdGcY',
  authDomain: 'tiger-api-client.firebaseapp.com',
  projectId: 'tiger-api-client',
  storageBucket: 'tiger-api-client.firebasestorage.app',
  messagingSenderId: '587566822935',
  appId: '1:587566822935:web:e8df01c0182a0b49e80e52',
  measurementId: 'G-9243WRQYTM'
}

type AnalyticsSdk = typeof import('firebase/analytics')

let sdk: AnalyticsSdk | null = null
let analytics: Analytics | null = null
// Default to disabled until the persisted setting resolves, so the opt-out is
// honored even on the very first event (no race where app_opened fires before
// getSettings() reports the user disabled analytics).
let enabled = false

export async function initAnalytics(): Promise<void> {
  try {
    const [{ initializeApp }, lib] = await Promise.all([
      import('firebase/app'),
      import('firebase/analytics')
    ])
    if (await lib.isSupported()) {
      analytics = lib.getAnalytics(initializeApp(firebaseConfig))
      sdk = lib
      lib.setAnalyticsCollectionEnabled(analytics, enabled)
    }
  } catch {
    // Offline, blocked, or unsupported: the app must not care.
  }
}

export function setAnalyticsEnabled(value: boolean): void {
  enabled = value
  if (analytics && sdk) {
    try {
      sdk.setAnalyticsCollectionEnabled(analytics, value)
    } catch {
      /* never disrupt the app */
    }
  }
}

export function trackEvent(event: AnalyticsEvent): void {
  if (!enabled) return
  try {
    if (analytics && sdk) sdk.logEvent(analytics, event.name, event.params)
    // Legacy GA4 Measurement Protocol path (user-supplied credentials).
    window.tiger?.track?.(event)
  } catch {
    /* never disrupt the app */
  }
}
