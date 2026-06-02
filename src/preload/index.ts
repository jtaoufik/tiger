import { contextBridge, ipcRenderer } from 'electron'
import type { BuiltRequest } from '../core/request'
import type { RawResponse } from '../core/response'
import type { RequestEntry, EnvironmentRef } from '../main/collection'
import type { Settings } from '../main/settings'
import type { HistoryEntry } from '../main/history'
import type { ImportKind } from '../main/importers'
import type { ImportResult } from '../core/import'
import type { AnalyticsEvent } from '../core/analytics'
import type { TigerAuth } from '../core/types'
import type { VarMap } from '../core/interpolate'

export interface OpenedCollection {
  root: string
  name: string
  requests: RequestEntry[]
  environments: EnvironmentRef[]
}

const api = {
  openCollection: (): Promise<OpenedCollection | null> => ipcRenderer.invoke('tiger:openCollection'),
  reload: (root: string): Promise<RequestEntry[]> => ipcRenderer.invoke('tiger:reload', root),
  readFile: (path: string): Promise<string> => ipcRenderer.invoke('tiger:readFile', path),
  writeFile: (path: string, content: string): Promise<boolean> =>
    ipcRenderer.invoke('tiger:writeFile', path, content),
  deleteFile: (path: string): Promise<boolean> => ipcRenderer.invoke('tiger:deleteFile', path),
  listEnvironments: (root: string): Promise<EnvironmentRef[]> =>
    ipcRenderer.invoke('tiger:listEnvironments', root),
  send: (built: BuiltRequest, timeoutMs: number): Promise<RawResponse> =>
    ipcRenderer.invoke('tiger:send', built, timeoutMs),
  oauthToken: (auth: Extract<TigerAuth, { type: 'oauth2' }>, vars: VarMap): Promise<string> =>
    ipcRenderer.invoke('tiger:oauthToken', auth, vars),
  importCollection: (kind: ImportKind): Promise<ImportResult | null> =>
    ipcRenderer.invoke('tiger:import', kind),
  exportCollection: (defaultName: string, content: string): Promise<string | null> =>
    ipcRenderer.invoke('tiger:export', defaultName, content),
  historyRead: (): Promise<HistoryEntry[]> => ipcRenderer.invoke('tiger:history:read'),
  historyClear: (): Promise<void> => ipcRenderer.invoke('tiger:history:clear'),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('tiger:getSettings'),
  setSettings: (patch: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke('tiger:setSettings', patch),
  track: (event: AnalyticsEvent): Promise<void> => ipcRenderer.invoke('tiger:track', event)
}

contextBridge.exposeInMainWorld('tiger', api)

export type TigerApi = typeof api
