/**
 * The renderer's side of WebSocket and SSE connections: one state per
 * request id (status plus timeline), kept outside React so a connection
 * survives switching tabs. The main process owns the sockets; this store
 * folds the events it sends back (core/realtime.ts) and offers
 * connect, send, disconnect and clear.
 */
import { useSyncExternalStore } from 'react'
import {
  applyRealtimeEvent,
  emptyConnection,
  isLive,
  type ConnectionState,
  type RealtimeEvent
} from '@core/realtime'
import type { VarMap } from '@core/interpolate'
import type { TigerRequest } from '@core/types'

const states = new Map<string, ConnectionState>()
const listeners = new Set<() => void>()
/** What the composer holds per request, so a draft survives switching tabs. */
const drafts = new Map<string, string>()
/** Receivers of raw events (the timeline's announcer). */
const eventListeners = new Set<(events: RealtimeEvent[]) => void>()
let unsubscribe: (() => void) | null = null

const IDLE = emptyConnection()

function notify(): void {
  for (const l of listeners) l()
}

/** Apply a batch of events from main (exported for tests). */
export function receiveRealtimeEvents(events: RealtimeEvent[]): void {
  for (const ev of events) states.set(ev.id, applyRealtimeEvent(states.get(ev.id) ?? emptyConnection(), ev))
  for (const l of eventListeners) l(events)
  notify()
}

function ensureSubscribed(): void {
  if (unsubscribe || !window.tiger?.realtime) return
  unsubscribe = window.tiger.realtime.onEvents(receiveRealtimeEvents)
}

export function connectionState(id: string): ConnectionState {
  return states.get(id) ?? IDLE
}

/** The live state of one connection; re-renders on every change. */
export function useConnection(id: string | null): ConnectionState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => (id ? connectionState(id) : IDLE)
  )
}

/** Listen to raw event batches; returns an unsubscribe function. */
export function onRealtimeEvents(cb: (events: RealtimeEvent[]) => void): () => void {
  ensureSubscribed()
  eventListeners.add(cb)
  return () => {
    eventListeners.delete(cb)
  }
}

/** Open the connection of a WebSocket or SSE request (main interpolates `vars`). */
export async function connectRealtime(id: string, request: TigerRequest, vars: VarMap): Promise<void> {
  ensureSubscribed()
  if (!window.tiger?.realtime) throw new Error('desktop only') // i18n-ignore: caller shows its own text
  await window.tiger.realtime.open({ id, request, vars })
}

export async function disconnectRealtime(id: string): Promise<void> {
  await window.tiger?.realtime?.close(id)
}

/** Send on an open WebSocket; false when it is not open. */
export async function sendRealtimeMessage(id: string, text: string): Promise<boolean> {
  if (connectionState(id).status !== 'open') return false
  return (await window.tiger?.realtime?.send(id, text)) ?? false
}

export function setRealtimeReconnect(id: string, on: boolean): void {
  void window.tiger?.realtime?.setReconnect(id, on)
}

/** Empty the timeline; the connection itself stays as it is. */
export function clearTimeline(id: string): void {
  const state = states.get(id)
  if (!state) return
  states.set(id, { ...state, entries: [] })
  notify()
}

/** True while the request's connection is open or opening. */
export function isConnected(id: string): boolean {
  return isLive(connectionState(id).status)
}

export function draftFor(id: string): string {
  return drafts.get(id) ?? ''
}

export function setDraft(id: string, text: string): void {
  drafts.set(id, text)
}

/** Close and forget a request's connection (the request was deleted). */
export function forgetRealtime(id: string): void {
  if (isConnected(id)) void disconnectRealtime(id)
  states.delete(id)
  drafts.delete(id)
  notify()
}
