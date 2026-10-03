import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { BuiltRequest } from '../core/request'
import type { RawResponse } from '../core/response'
import type { RequestEntry, EnvironmentRef, OpenedCollectionPayload } from '../main/collection'
import type { Settings } from '../main/settings'
import type { HistoryEntry } from '../main/history'
import type { ImportKind } from '../main/importers'
import type { ImportResult } from '../core/import'
import type { CollectionFile } from '../core/collectionFiles'
import type { McpInfo } from '../mcp/launch'
import type { AnalyticsEvent } from '../core/analytics'
import type { UpdateInfo } from '../core/version'
import type { UpdateModeInfo } from '../core/updateMode'
import type { UpdateState } from '../core/updateState'
import type {
  GitActionResult,
  GitAvailability,
  GitBranches,
  GitCommit,
  GitConflict,
  GitErrorCode,
  GitStatus,
  SyncPhase
} from '../main/git'
import type { TigerAuth } from '../core/types'
import type { VarMap } from '../core/interpolate'
import type { ScriptJob } from '../core/scriptProtocol'
import type { ScriptRunResult } from '../core/script'
import type { Locale } from '../core/i18n/locales'

/** The language main resolved at window creation (--tiger-locale=xx). */
function initialLocale(): string | undefined {
  const arg = process.argv.find((a) => a.startsWith('--tiger-locale='))
  return arg ? arg.slice('--tiger-locale='.length) : undefined
}

export type OpenedCollection = OpenedCollectionPayload

/**
 * ipcRenderer.invoke, minus the wrapper Electron puts around errors from main
 * ("Error invoking remote method 'tiger:send': Error: ..."), which the
 * response panel, the runner and toasts used to show as is.
 */
function invoke<T = never>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args).catch((e: unknown) => {
    const message = e instanceof Error ? e.message : String(e)
    throw new Error(message.replace(/^Error invoking remote method '[^']*': (?:[A-Za-z]*Error: )?/, ''))
  })
}

const api = {
  /** Language to render the first frame in; validated by the renderer. */
  initialLocale: initialLocale(),
  /** The app's current language, resolved by main (settings or system). */
  locale: (): Promise<Locale> => invoke('tiger:locale'),
  /** Language changes (Settings > Language); returns an unsubscribe function. */
  onLocale: (cb: (locale: Locale) => void): (() => void) => {
    const listener = (_e: unknown, locale: Locale): void => cb(locale)
    ipcRenderer.on('tiger:locale', listener)
    return () => {
      ipcRenderer.removeListener('tiger:locale', listener)
    }
  },
  openCollection: (): Promise<OpenedCollection | null> => invoke('tiger:openCollection'),
  newCollection: (name: string): Promise<OpenedCollection | null> =>
    invoke('tiger:newCollection', name),
  openPath: (root: string): Promise<OpenedCollection | null> => invoke('tiger:openPath', root),
  /** Save a collection that lives in memory (an import) as a folder in Documents/Tiger. */
  saveCollection: (name: string, files: CollectionFile[]): Promise<OpenedCollection> =>
    invoke('tiger:saveCollection', name, files),
  reload: (root: string): Promise<RequestEntry[]> => invoke('tiger:reload', root),
  readFile: (path: string): Promise<string> => invoke('tiger:readFile', path),
  writeFile: (path: string, content: string): Promise<boolean> =>
    invoke('tiger:writeFile', path, content),
  deleteFile: (path: string): Promise<boolean> => invoke('tiger:deleteFile', path),
  moveFile: (from: string, to: string): Promise<boolean> =>
    invoke('tiger:moveFile', from, to),
  listEnvironments: (root: string): Promise<EnvironmentRef[]> =>
    invoke('tiger:listEnvironments', root),
  /** `record: false` keeps the send out of the history (load tests). */
  send: (
    built: BuiltRequest,
    timeoutMs: number,
    cancelKey?: string,
    options?: { record?: boolean }
  ): Promise<RawResponse> => invoke('tiger:send', built, timeoutMs, cancelKey, options),
  /** Run a collection script in the isolated script host (never in this window). */
  runScript: (job: ScriptJob): Promise<ScriptRunResult> => invoke('tiger:script:run', job),
  cancelSend: (key: string): Promise<boolean> => invoke('tiger:cancelSend', key),
  oauthToken: (auth: Extract<TigerAuth, { type: 'oauth2' }>, vars: VarMap): Promise<string> =>
    invoke('tiger:oauthToken', auth, vars),
  /** Forget a cached OAuth2 token so the next send asks for a fresh one. */
  oauthForget: (auth: Extract<TigerAuth, { type: 'oauth2' }>, vars: VarMap): Promise<void> =>
    invoke('tiger:oauthForget', auth, vars),
  importCollection: (kind: ImportKind): Promise<ImportResult | null> =>
    invoke('tiger:import', kind),
  /** Import dropped files or folders; the format is detected per file. */
  importPaths: (paths: string[]): Promise<ImportResult | null> =>
    invoke('tiger:importPaths', paths),
  /** The disk path of a dropped File (File.path was removed in Electron 32). */
  pathForFile: (file: File): string => webUtils.getPathForFile(file),
  exportCollection: (defaultName: string, content: string): Promise<string | null> =>
    invoke('tiger:export', defaultName, content),
  /** Save a response body's exact bytes (base64) where the user picks. */
  saveResponse: (defaultName: string, base64: string): Promise<string | null> =>
    invoke('tiger:saveResponse', defaultName, base64),
  historyRead: (): Promise<HistoryEntry[]> => invoke('tiger:history:read'),
  historyClear: (): Promise<void> => invoke('tiger:history:clear'),
  getSettings: (): Promise<Settings> => invoke('tiger:getSettings'),
  setSettings: (patch: Partial<Settings>): Promise<Settings> =>
    invoke('tiger:setSettings', patch),
  track: (event: AnalyticsEvent): Promise<void> => invoke('tiger:track', event),
  version: (): Promise<string> => invoke('tiger:version'),
  git: {
    check: (): Promise<GitAvailability> => invoke('tiger:git:check'),
    status: (root: string): Promise<GitStatus> => invoke('tiger:git:status', root),
    diff: (root: string): Promise<string> => invoke('tiger:git:diff', root),
    commit: (root: string, message: string): Promise<GitActionResult> =>
      invoke('tiger:git:commit', root, message),
    pull: (root: string): Promise<GitActionResult> => invoke('tiger:git:pull', root),
    push: (root: string): Promise<GitActionResult> => invoke('tiger:git:push', root),
    init: (root: string): Promise<GitActionResult> => invoke('tiger:git:init', root),
    sync: (root: string, message: string): Promise<GitActionResult> =>
      invoke('tiger:git:sync', root, message),
    syncResolve: (
      root: string,
      prefer: 'mine' | 'theirs',
      message: string,
      choices?: Record<string, 'mine' | 'theirs'>
    ): Promise<GitActionResult> =>
      invoke('tiger:git:syncResolve', root, prefer, message, choices),
    /** Sync phases as they happen; returns an unsubscribe function. */
    onProgress: (cb: (event: { root: string; phase: SyncPhase }) => void): (() => void) => {
      const listener = (_e: unknown, event: { root: string; phase: SyncPhase }): void => cb(event)
      ipcRenderer.on('tiger:git:progress', listener)
      return () => {
        ipcRenderer.removeListener('tiger:git:progress', listener)
      }
    },
    fetch: (root: string): Promise<GitActionResult> => invoke('tiger:git:fetch', root),
    diffFile: (root: string, path: string): Promise<string> =>
      invoke('tiger:git:diffFile', root, path),
    requestNames: (root: string, paths: string[]): Promise<Record<string, string>> =>
      invoke('tiger:git:requestNames', root, paths),
    conflicts: (root: string): Promise<GitConflict[]> => invoke('tiger:git:conflicts', root),
    setIdentity: (root: string, name: string, email: string): Promise<GitActionResult> =>
      invoke('tiger:git:setIdentity', root, name, email),
    undoDiscard: (root: string, token: string): Promise<GitActionResult> =>
      invoke('tiger:git:undoDiscard', root, token),
    setRemote: (root: string, url: string): Promise<GitActionResult> =>
      invoke('tiger:git:setRemote', root, url),
    branches: (root: string): Promise<GitBranches> => invoke('tiger:git:branches', root),
    checkout: (root: string, branch: string, create: boolean): Promise<GitActionResult> =>
      invoke('tiger:git:checkout', root, branch, create),
    log: (root: string): Promise<GitCommit[]> => invoke('tiger:git:log', root),
    discard: (root: string, paths?: string[]): Promise<GitActionResult> =>
      invoke('tiger:git:discard', root, paths),
    clone: (url: string): Promise<OpenedCollection | { error: string; code?: GitErrorCode } | null> =>
      invoke('tiger:git:clone', url)
  },
  checkUpdate: (): Promise<UpdateInfo | null> => invoke('tiger:checkUpdate'),
  installUpdate: (): Promise<void> => invoke('tiger:installUpdate'),
  /** 'auto' when electron-updater installs updates in place for this install. */
  updateMode: (): Promise<UpdateModeInfo> => invoke('tiger:update:mode'),
  updateState: (): Promise<UpdateState> => invoke('tiger:update:getState'),
  checkForUpdatesNow: (): Promise<UpdateState> => invoke('tiger:update:check'),
  downloadUpdate: (): Promise<void> => invoke('tiger:update:download'),
  onUpdateState: (cb: (state: UpdateState) => void): (() => void) => {
    const listener = (_e: unknown, next: UpdateState) => cb(next)
    ipcRenderer.on('tiger:update:state', listener)
    return () => {
      ipcRenderer.removeListener('tiger:update:state', listener)
    }
  },
  onShortcut: (cb: (name: string) => void): void => {
    ipcRenderer.on('tiger:shortcut', (_e, name) => cb(name))
  },
  onFullscreen: (cb: (state: boolean) => void): void => {
    ipcRenderer.on('tiger:fullscreen', (_e, state) => cb(state))
  },
  /** Dev-only startup timing (see src/main/perf.ts); ignored when disabled. */
  perfMark: (name: string, at: number): void => {
    ipcRenderer.send('tiger:perf', name, at)
  },
  setDirty: (dirty: boolean): void => {
    ipcRenderer.send('tiger:dirtyState', dirty)
  },
  openExternal: (url: string): Promise<void> => invoke('tiger:openExternal', url),
  reveal: (path: string): Promise<void> => invoke('tiger:reveal', path),
  pickFile: (filters: { name: string; extensions: string[] }[]): Promise<string | null> =>
    invoke('tiger:pickFile', filters),
  clearCookies: (): Promise<void> => invoke('tiger:cookies:clear'),
  mcpInfo: (): Promise<McpInfo> => invoke('tiger:mcpInfo')
}

contextBridge.exposeInMainWorld('tiger', api)

export type TigerApi = typeof api
