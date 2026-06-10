/**
 * Anonymous usage analytics. The toggle defaults to on, but nothing is ever
 * sent until the user configures their own GA4 credentials in Settings, so a
 * stock build is inert. This module is pure: it shapes events and builds a GA4
 * Measurement Protocol payload; the network send lives in the main process.
 *
 * Privacy rules enforced here:
 *  - no URLs, hostnames, header values or response bodies are ever recorded;
 *  - status codes are bucketed (2xx, 4xx, …), not stored exactly;
 *  - the only identifier is a random, app-local client id.
 */

export type EventParamValue = string | number | boolean

export interface AnalyticsEvent {
  name: string
  params?: Record<string, EventParamValue>
}

export interface MeasurementPayload {
  client_id: string
  events: AnalyticsEvent[]
}

/** GA4 event names: lower snake case, alphanumeric + underscore, ≤ 40 chars. */
export function sanitizeEventName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

/** Group a status code into a privacy-safe bucket like "2xx". */
export function statusBucket(status: number): string {
  if (status < 100 || status > 599) return 'unknown'
  return `${Math.floor(status / 100)}xx`
}

export function measurementEndpoint(measurementId: string, apiSecret: string): string {
  const params = new URLSearchParams({
    measurement_id: measurementId,
    api_secret: apiSecret
  })
  return `https://www.google-analytics.com/mp/collect?${params.toString()}`
}

export function buildMeasurementPayload(
  clientId: string,
  events: AnalyticsEvent[]
): MeasurementPayload {
  return {
    client_id: clientId,
    events: events.map((e) => ({
      name: sanitizeEventName(e.name),
      params: e.params
    }))
  }
}

/** Convenience constructors for the handful of events Tiger records. */
export const events = {
  appOpened(): AnalyticsEvent {
    return { name: 'app_opened' }
  },
  requestSent(method: string, status: number, ok: boolean): AnalyticsEvent {
    return {
      name: 'request_sent',
      params: { method: method.toUpperCase(), status_bucket: statusBucket(status), ok }
    }
  },
  collectionImported(source: string, count: number): AnalyticsEvent {
    return { name: 'collection_imported', params: { source, request_count: count } }
  }
}
