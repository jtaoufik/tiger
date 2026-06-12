import { buildRequest } from '@core/request'
import { assembleMultipart, generateBoundary } from '@core/multipart'
import { envToVars } from '@core/interpolate'
import { formatResponse, type FormattedResponse, type RawResponse } from '@core/response'
import type { TigerEnvironment, TigerRequest } from '@core/types'

/** Browser-preview fallback controllers, keyed like the main-process ones. */
const browserInFlight = new Map<string, AbortController>()

export async function cancelRequest(key: string): Promise<void> {
  browserInFlight.get(key)?.abort()
  await window.tiger?.cancelSend?.(key)
}

/**
 * Run a request through the main process when running under Electron, or fall
 * back to a direct fetch in a plain browser (dev previews).
 */
export async function runRequest(
  req: TigerRequest,
  env: TigerEnvironment | null,
  timeoutMs: number,
  cancelKey?: string
): Promise<FormattedResponse> {
  const vars = envToVars(env)

  // OAuth2 client-credentials needs a token exchange first (done in main).
  let effective = req
  if (req.auth?.type === 'oauth2' && window.tiger?.oauthToken) {
    const token = await window.tiger.oauthToken(req.auth, vars)
    effective = { ...req, auth: { type: 'bearer', token } }
  }

  const built = buildRequest(effective, vars)

  let raw: RawResponse
  try {
    if (window.tiger) {
      raw = await window.tiger.send(built, timeoutMs, cancelKey)
    } else {
      const controller = new AbortController()
      if (cancelKey) browserInFlight.set(cancelKey, controller)
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const started = performance.now()
      try {
        // multipart in the browser preview: text fields work; file rows need
        // the desktop app (the browser cannot read arbitrary disk paths).
        let bodyPayload: BodyInit | undefined = built.body
        let sendHeaders = built.headers
        if (built.multipart?.length) {
          if (built.multipart.some((p) => p.isFile)) {
            throw new Error('File uploads need the desktop app')
          }
          const assembled = assembleMultipart(
            built.multipart.map((p) => ({ name: p.name, value: p.value })),
            generateBoundary()
          )
          bodyPayload = assembled.bytes as unknown as BodyInit
          sendHeaders = { ...sendHeaders, 'Content-Type': assembled.contentType }
        }
        const res = await fetch(built.url, {
          method: built.method,
          headers: sendHeaders,
          body: bodyPayload,
          signal: controller.signal
        })
        const headersAt = performance.now()
        const body = await res.text()
        const endAt = performance.now()
        const headers: Record<string, string> = {}
        res.headers.forEach((value, key) => {
          headers[key] = value
        })
        raw = {
          status: res.status,
          statusText: res.statusText,
          headers,
          body,
          timeMs: Math.round(endAt - started),
          timings: {
            total: Math.round(endAt - started),
            waiting: Math.round(headersAt - started),
            download: Math.round(endAt - headersAt)
          }
        }
      } finally {
        clearTimeout(timer)
        if (cancelKey) browserInFlight.delete(cancelKey)
      }
    }
  } catch (e) {
    const message = (e as Error).message ?? ''
    if ((e as Error).name === 'AbortError' || /abort/i.test(message)) {
      throw new Error('Request cancelled (or timed out)')
    }
    throw e
  }

  return formatResponse(raw)
}
