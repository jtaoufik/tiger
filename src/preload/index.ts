import { contextBridge, ipcRenderer } from 'electron'
import type { BuiltRequest } from '../core/request'
import type { RawResponse } from '../core/response'
import type { RequestEntry, EnvironmentRef } from '../main/collection'
import type { Settings } from '../main/settings'
import type { HistoryEntry } from '../main/history'
import type { ImportKind } from '../main/importers'
import type { ImportResult } from '../core/import'
import type { AnalyticsEvent } from '../core/analytics'
import type { UpdateInfo } from '../core/version'
import type { GitActionResult, GitAvailability, GitBranches, GitCommit, GitStatus } from '../main/git'
import type { CollectionSettings } from '../core/collectionSettings'
import type { TigerAuth } from '../core/types'
import type { VarMap } from '../core/interpolate'

export interface OpenedCollection {
  root: string
  name: string
  requests: RequestEntry[]
  environments: EnvironmentRef[]
  settings: CollectionSettings
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
  send: (built: BuiltRequest, timeoutMs: number, cancelKey?: string): Promise<RawResponse> =>
    ipcRenderer.invoke('tiger:send', built, timeoutMs, cancelKey),
  cancelSend: (key: string): Promise<boolean> => ipcRenderer.invoke('tiger:cancelSend', key),
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
  track: (event: AnalyticsEvent): Promise<void> => ipcRenderer.invoke('tiger:track', event),
  version: (): Promise<string> => ipcRenderer.invoke('tiger:version'),
  git: {
    check: (): Promise<GitAvailability> => ipcRenderer.invoke('tiger:git:check'),
    status: (root: string): Promise<GitStatus> => ipcRenderer.invoke('tiger:git:status', root),
    diff: (root: string): Promise<string> => ipcRenderer.invoke('tiger:git:diff', root),
    commit: (root: string, message: string): Promise<GitActionResult> =>
      ipcRenderer.invoke('tiger:git:commit', root, message),
    pull: (root: string): Promise<GitActionResult> => ipcRenderer.invoke('tiger:git:pull', root),
    push: (root: string): Promise<GitActionResult> => ipcRenderer.invoke('tiger:git:push', root),
    init: (root: string): Promise<GitActionResult> => ipcRenderer.invoke('tiger:git:init', root),
    sync: (root: string, message: string): Promise<GitActionResult> =>
      ipcRenderer.invoke('tiger:git:sync', root, message),
    setRemote: (root: string, url: string): Promise<GitActionResult> =>
      ipcRenderer.invoke('tiger:git:setRemote', root, url),
    branches: (root: string): Promise<GitBranches> => ipcRenderer.invoke('tiger:git:branches', root),
    checkout: (root: string, branch: string, create: boolean): Promise<GitActionResult> =>
      ipcRenderer.invoke('tiger:git:checkout', root, branch, create),
    log: (root: string): Promise<GitCommit[]> => ipcRenderer.invoke('tiger:git:log', root),
    discard: (root: string): Promise<GitActionResult> => ipcRenderer.invoke('tiger:git:discard', root),
    clone: (url: string): Promise<OpenedCollection | { error: string } | null> =>
      ipcRenderer.invoke('tiger:git:clone', url)
  },
  checkUpdate: (): Promise<UpdateInfo | null> => ipcRenderer.invoke('tiger:checkUpdate'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('tiger:openExternal', url),
  reveal: (path: string): Promise<void> => ipcRenderer.invoke('tiger:reveal', path),
  pickFile: (filters: { name: string; extensions: string[] }[]): Promise<string | null> =>
    ipcRenderer.invoke('tiger:pickFile', filters),
  clearCookies: (): Promise<void> => ipcRenderer.invoke('tiger:cookies:clear'),
  mcpInfo: (): Promise<{ serverPath: string }> => ipcRenderer.invoke('tiger:mcpInfo')
}

contextBridge.exposeInMainWorld('tiger', api)

export type TigerApi = typeof api
