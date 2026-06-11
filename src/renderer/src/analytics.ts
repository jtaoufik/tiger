/**
 * Firebase Analytics (project tiger-api-client). Events flow to the app's own
 * GA4 property; the user toggle in Settings gates everything. Event shapes
 * come from core/analytics so the privacy rules (no URLs, no headers, no
 * bodies, bucketed status codes) hold here too.
 */
import { initializeApp } from 'firebase/app'
import {
  getAnalytics,
  isSupported,
  logEvent,
  setAnalyticsCollectionEnabled,
  type Analytics
} from 'firebase/analytics'
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

let analytics: Analytics | null = null
let enabled = true

export async function initAnalytics(): Promise<void> {
  try {
    if (await isSupported()) {
      analytics = getAnalytics(initializeApp(firebaseConfig))
      setAnalyticsCollectionEnabled(analytics, enabled)
    }
  } catch {
    // Offline, blocked, or unsupported: the app must not care.
  }
}

export function setAnalyticsEnabled(value: boolean): void {
  enabled = value
  if (analytics) {
    try {
      setAnalyticsCollectionEnabled(analytics, value)
    } catch {
      /* never disrupt the app */
    }
  }
}

export function trackEvent(event: AnalyticsEvent): void {
  if (!enabled) return
  try {
    if (analytics) logEvent(analytics, event.name, event.params)
    // Legacy GA4 Measurement Protocol path (user-supplied credentials).
    window.tiger?.track?.(event)
  } catch {
    /* never disrupt the app */
  }
}
