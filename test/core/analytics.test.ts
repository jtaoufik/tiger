import { describe, expect, it } from 'vitest'
import {
  buildMeasurementPayload,
  events,
  measurementEndpoint,
  sanitizeEventName,
  statusBucket
} from '../../src/core/analytics'

describe('sanitizeEventName', () => {
  it('lowercases and replaces invalid characters', () => {
    expect(sanitizeEventName('Request Sent!')).toBe('request_sent')
  })

  it('truncates to 40 characters', () => {
    expect(sanitizeEventName('a'.repeat(60))).toHaveLength(40)
  })
})

describe('statusBucket', () => {
  it('buckets by hundreds', () => {
    expect(statusBucket(204)).toBe('2xx')
    expect(statusBucket(404)).toBe('4xx')
    expect(statusBucket(503)).toBe('5xx')
  })

  it('returns unknown for out-of-range codes', () => {
    expect(statusBucket(0)).toBe('unknown')
  })
})

describe('measurementEndpoint', () => {
  it('encodes the GA4 query params', () => {
    expect(measurementEndpoint('G-123', 's e c r e t')).toBe(
      'https://www.google-analytics.com/mp/collect?measurement_id=G-123&api_secret=s+e+c+r+e+t'
    )
  })
})

describe('buildMeasurementPayload', () => {
  it('wraps events with the client id and sanitizes names', () => {
    const payload = buildMeasurementPayload('anon-1', [{ name: 'App Opened' }])
    expect(payload).toEqual({
      client_id: 'anon-1',
      events: [{ name: 'app_opened', params: undefined }]
    })
  })
})

describe('event constructors', () => {
  it('records a request without leaking the URL', () => {
    const e = events.requestSent('get', 404, false)
    expect(e).toEqual({
      name: 'request_sent',
      params: { method: 'GET', status_bucket: '4xx', ok: false }
    })
    expect(JSON.stringify(e)).not.toMatch(/http/)
  })

  it('records an import with source and count', () => {
    expect(events.collectionImported('postman', 12)).toEqual({
      name: 'collection_imported',
      params: { source: 'postman', request_count: 12 }
    })
  })
})
