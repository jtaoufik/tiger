import { useCallback, useEffect, useRef, useState } from 'react'
import { parseRequest, serializeRequest } from '@core/tigerFormat'
import { parseEnvironment, serializeEnvironment } from '@core/environment'
import { buildRequest } from '@core/request'
import { envToVars, findMissingVars } from '@core/interpolate'
import {
  parseCollectionSettings,
  resolveAuth,
  serializeCollectionSettings
} from '@core/collectionSettings'
import type { SearchItem } from '@core/search'
import { exportOpenApi, exportPostman, exportPostmanEnvironment } from '@core/export'
import { toCurl } from '@core/codegen'
import { importCurl } from '@core/import'
import { extractCaptures } from '@core/capture'
import { movedRequestPath, renamedFolderPath, uniqueCopyName } from '@core/treeMove'
import type { RunnerItem } from '@core/runner'
import type { ScriptTestResult } from '@core/script'
import { runScriptIsolated } from './scriptSandbox'
import { events } from '@core/analytics'
import type { FormattedResponse } from '@core/response'
import type { ImportedRequest } from '@core/import'
import type { HttpMethod, KeyValue, TigerAuth, TigerEnvironment, TigerRequest } from '@core/types'
import type { OpenedCollection } from '../../preload'
import type { Settings } from '../../main/settings'
import type { HistoryEntry } from '../../main/history'
import type { ImportKind } from '../../main/importers'
import { Logo } from './Logo'
import { Sidebar, type SidebarEntry, type SyncState } from './components/Sidebar'
import { GitModal } from './components/GitModal'
import { JoinTeamModal } from './components/TeamSync'
import { onGitChanged } from './gitUx'
import { CollectionView } from './components/CollectionView'
import { FolderView } from './components/FolderView'
import { WelcomeView } from './components/WelcomeView'
import { RequestEditor } from './components/RequestEditor'
import { RequestTabs, tabAccessibleName, type RequestTab } from './components/RequestTabs'
import { ResponsePanel } from './components/ResponsePanel'
import { SettingsView } from './components/SettingsView'
import { ImportExportModal, type ExportFormat } from './components/ImportExportModal'
import { HistoryModal } from './components/HistoryModal'
import { EnvironmentsModal } from './components/EnvironmentsModal'
import { ConfirmModal } from './components/ConfirmModal'
import { PromptModal } from './components/PromptModal'
import { RunnerModal } from './components/RunnerModal'
import { ShortcutsModal } from './components/ShortcutsModal'
import { REVEAL_LABEL } from './platform'
import { Modal } from './components/Modal'
import { AuthEditor } from './components/AuthEditor'
import { ContextMenu, type MenuItem } from './components/ContextMenu'
import { PaletteModal } from './components/PaletteModal'
import { Resizer } from './components/Resizer'
import { UpdateModal } from './components/UpdateModal'
import type { UpdateInfo } from '@core/version'
import { docsUrl, REPO_URL, type ActionId, type RequestSectionId } from '@core/actions'
import { actionItem, actionTitle } from './actions'
import { openExternal } from './components/HelpLink'
import {
  ArrowRightToLineIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  CopyIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  GearIcon,
  ListXIcon,
  LocateIcon,
  PencilIcon,
  PlusIcon,
  SidebarIcon,
  TrashIcon,
  XCircleIcon
} from './components/Icons'
import {
  SEP,
  SESSION_KEYS,
  parseStoredRoots,
  parseStoredTabs,
  resolveStoredTabs,
  tabKey,
  type OpenTab
} from './session'
import { cancelRequest, runRequest } from './runRequest'
import { announce, ensureLiveRegions, looksLikeError } from './a11y'
import { initAnalytics, setAnalyticsEnabled, trackEvent } from './analytics'
import { sampleEnvironment, sampleRequests } from './sample'

interface ResponseState {
  loading: boolean
  error?: string
  data?: FormattedResponse
  tests?: ScriptTestResult[]
  logs?: string[]
}

interface EnvRef {
  name: string
  path?: string
  data?: TigerEnvironment
}

interface CollectionState {
  id: string
  name: string
  /** Absolute folder path when the collection lives on disk. */
  root?: string
  entries: SidebarEntry[]
  environments: EnvRef[]
  /** Collection-level default auth, inherited by requests. */
  auth?: TigerAuth
  /** Collection-level documentation (markdown). */
  docs?: string
}

type ModalKind = 'none' | 'io' | 'history' | 'env' | 'shortcuts'

interface Toast {
  id: number
  text: string
  /** Failures render with an error icon and are announced assertively. */
  error?: boolean
}

const FALLBACK_SETTINGS: Settings = {
  theme: 'system',
  timeoutMs: 30000,
  fontSize: 13,
  followRedirects: true,
  maxRedirects: 5,
  sslVerify: true,
  certExceptions: '',
  caFile: '',
  clientCertFile: '',
  clientKeyFile: '',
  clientPfxFile: '',
  certPassphrase: '',
  cookieJarEnabled: true,
  proxyEnabled: false,
  proxyUrl: '',
  proxyUsername: '',
  proxyPassword: '',
  clientCertSubject: '',
  analyticsEnabled: true,
  clientId: 'local'
}

const DEMO_COLLECTION: CollectionState = {
  id: 'demo',
  name: 'Demo collection',
  entries: sampleRequests.map((r) => ({
    id: r.id,
    name: r.request.name,
    method: r.request.method,
    folderPath: [r.folder]
  })),
  environments: [{ name: 'Demo', data: sampleEnvironment }]
}

/** localStorage is unavailable in some test environments; never throw. */
function readStored(key: string): string | null {
  try {
    return window.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage?.setItem(key, value)
  } catch {
    /* unavailable */
  }
}

function resolveDark(theme: Settings['theme']): boolean {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * The text that will actually be interpolated and sent: enabled rows only, no
 * request name, body only for methods that send one. Used for the unresolved
 * variable warning so disabled rows don't false-positive.
 */
function sentSurface(req: TigerRequest): string {
  const parts = [req.url]
  for (const h of req.headers) if (h.enabled !== false) parts.push(h.name, h.value)
  for (const q of req.query) if (q.enabled !== false) parts.push(q.name, q.value)
  if (req.body.type !== 'none' && !['get', 'head'].includes(req.method)) {
    if (req.body.type === 'form') {
      parts.push(
        req.body.content
          .split('\n')
          .filter((l) => !l.trim().startsWith('~'))
          .join('\n')
      )
    } else {
      parts.push(req.body.content)
    }
  }
  if (req.auth && req.auth.type !== 'none') parts.push(JSON.stringify(req.auth))
  return parts.join('\n')
}

/** Browser-preview fallback when the Electron save dialog is unavailable. */
function downloadText(filename: string, text: string): boolean {
  if (typeof URL.createObjectURL !== 'function') return false
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/octet-stream' }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
  return true
}

let toastSeq = 0

export default function App() {
  const [settings, setSettings] = useState<Settings>(FALLBACK_SETTINGS)
  const [view, setView] = useState<'workspace' | 'settings' | 'home'>('workspace')
  const [modal, setModal] = useState<ModalKind>('none')
  const [toasts, setToasts] = useState<Toast[]>([])

  /**
   * Bootstrap with the demo collection only when there is no session to
   * restore (no bridge, or no persisted roots). When a session exists, state
   * starts empty and the restore effects below repopulate it.
   */
  const [bootDemo] = useState(
    () => !window.tiger?.openPath || parseStoredRoots(readStored(SESSION_KEYS.roots)).length === 0
  )
  const [collections, setCollections] = useState<CollectionState[]>(
    bootDemo ? [DEMO_COLLECTION] : []
  )
  const [requestsById, setRequestsById] = useState<Record<string, TigerRequest>>(
    bootDemo ? Object.fromEntries(sampleRequests.map((r) => [r.id, r.request])) : {}
  )
  const [pathById, setPathById] = useState<Record<string, string>>({})
  const [activeId, setActiveId] = useState<string | null>(
    bootDemo ? (sampleRequests[0]?.id ?? null) : null
  )
  /** Open tabs (requests, collection pages, folder pages), in opening order. */
  const [openTabs, setOpenTabs] = useState<OpenTab[]>(
    bootDemo && sampleRequests[0] ? [{ kind: 'request', id: sampleRequests[0].id }] : []
  )

  const [activeEnvKey, setActiveEnvKey] = useState<string | null>(
    bootDemo ? `demo${SEP}Demo` : null
  )
  const [activeEnv, setActiveEnv] = useState<TigerEnvironment | null>(
    bootDemo ? sampleEnvironment : null
  )
  /**
   * Always-current mirror of activeEnv + its key. applyCaptures runs after an
   * async send and must merge into the LATEST environment, not the snapshot it
   * closed over when send started — otherwise a concurrent edit (or a second
   * capture) is silently overwritten in state and on disk.
   */
  const activeEnvRef = useRef<{ key: string | null; env: TigerEnvironment | null }>({
    key: bootDemo ? `demo${SEP}Demo` : null,
    env: bootDemo ? sampleEnvironment : null
  })
  useEffect(() => {
    activeEnvRef.current = { key: activeEnvKey, env: activeEnv }
  }, [activeEnvKey, activeEnv])

  const [responses, setResponses] = useState<Record<string, ResponseState>>({})
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [appVersion, setAppVersion] = useState('dev')
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [updateModalOpen, setUpdateModalOpen] = useState(false)
  const [downloadedUpdate, setDownloadedUpdate] = useState<string | null>(null)
  const [gitStates, setGitStates] = useState<Record<string, SyncState>>({})
  const [gitColId, setGitColId] = useState<string | null>(null)
  /** Opened from the "Sync with team" command: start syncing right away. */
  const [gitAutoSync, setGitAutoSync] = useState(false)
  const [authColId, setAuthColId] = useState<string | null>(null)
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null)
  const [emptyMenu, setEmptyMenu] = useState<{ x: number; y: number } | null>(null)
  const [cloneOpen, setCloneOpen] = useState(false)
  const [newCollectionOpen, setNewCollectionOpen] = useState(false)
  const [runnerScope, setRunnerScope] = useState<{ colId: string; path?: string[] } | null>(null)
  const [inspect, setInspect] = useState<
    { type: 'collection'; colId: string } | { type: 'folder'; colId: string; path: string[] } | null
  >(null)
  const [colHistory, setColHistory] = useState<HistoryEntry[]>([])
  /** Folder-level default auth + docs, keyed by `${colId}${SEP}${path}`. */
  const [folderSettings, setFolderSettings] = useState<
    Record<string, { auth?: TigerAuth; docs?: string }>
  >({})
  const folderSettingsRef = useRef(folderSettings)
  useEffect(() => {
    folderSettingsRef.current = folderSettings
  })
  const [ctxMenu, setCtxMenu] = useState<{
    x: number
    y: number
    items: MenuItem[]
    label?: string
  } | null>(null)
  const [sidebarW, setSidebarW] = useState(() => Number(readStored('tiger.sidebarW')) || 264)
  const [sidebarHidden, setSidebarHidden] = useState(() => readStored('tiger.sidebarHidden') === '1')
  /** Which half of the Import and export dialog the entry point asked for. */
  const [ioFocus, setIoFocus] = useState<'import' | 'export'>('import')
  /** Environments dialog opened by "New environment": create one right away. */
  const [envStartNew, setEnvStartNew] = useState(false)
  /** "New folder" prompt target: the collection and the parent folder. */
  const [newFolderIn, setNewFolderIn] = useState<{ colId: string; path: string[] } | null>(null)
  const renameSeq = useRef(0)
  const [renameTarget, setRenameTarget] = useState<
    { id?: string; colId?: string; path?: string[]; nonce: number } | null
  >(null)
  /** Ask the request editor to show a section (menu "Load test"). */
  const [showSection, setShowSection] = useState<{ id: RequestSectionId; nonce: number } | null>(null)
  const [editorH, setEditorH] = useState<number | null>(() => {
    const stored = Number(readStored('tiger.editorH'))
    return stored > 0 ? stored : null
  })
  const sidebarBase = useRef(sidebarW)
  const editorBase = useRef<number | null>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const importCount = useRef(0)
  /** Last-saved serialization per disk request, for the dirty indicator. */
  const savedText = useRef<Record<string, string>>({})
  /** Guards async continuations against requests deleted mid-flight. */
  const deletedIds = useRef(new Set<string>())
  /** Requests edited since last save, for cheap dirty tracking on large bodies. */
  const editedIds = useRef(new Set<string>())
  /** Monotonic token so a stale environment file read can't win a race. */
  const envSeq = useRef(0)

  /**
   * Un-tombstone ids as they are (re)registered. Without this, reopening,
   * cloning, importing, or re-creating a request that reuses a previously
   * deleted id would leave it tombstoned: its send stays stuck on "loading"
   * (the response/capture setters bail on deletedIds) forever.
   */
  const reviveIds = useCallback((ids: Iterable<string>) => {
    for (const id of ids) deletedIds.current.delete(id)
  }, [])

  const toast = useCallback((text: string) => {
    const id = ++toastSeq
    const error = looksLikeError(text)
    setToasts((prev) => [...prev, { id, text, error }])
    // Errors stay up longer: they are the ones people need to read.
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), error ? 6000 : 2600)
  }, [])

  // Live regions must exist before their first message.
  useEffect(() => {
    ensureLiveRegions()
  }, [])

  useEffect(() => {
    // Analytics must wait for the persisted opt-out to resolve. analytics.ts
    // defaults to disabled, so initializing + firing app_opened before settings
    // load would either be dropped or (worse) race ahead of a user opt-out.
    // Resolve settings first, set the flag, THEN init and emit app_opened.
    const settingsLoaded = window.tiger?.getSettings
      ? window.tiger.getSettings().then((s) => {
          setSettings(s)
          setAnalyticsEnabled(s.analyticsEnabled)
          return s.analyticsEnabled
        })
      : Promise.resolve(FALLBACK_SETTINGS.analyticsEnabled)
    settingsLoaded.then(async (analyticsOn) => {
      if (!analyticsOn) return
      await initAnalytics()
      trackEvent(events.appOpened())
    })
    window.tiger?.version?.().then(setAppVersion)
    window.tiger?.checkUpdate?.().then((info) => {
      if (info) {
        setUpdate(info)
        setUpdateModalOpen(true)
      }
    })
    // electron-updater (packaged builds) downloads in the background and fires
    // this when the new version is ready to install on restart.
    window.tiger?.onUpdateDownloaded?.((info) => setDownloadedUpdate(info.version))
  }, [])

  useEffect(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    const platform = /Windows/i.test(ua) ? 'win' : /Mac/i.test(ua) ? 'mac' : 'linux'
    document.documentElement.dataset.platform = platform
    // macOS fullscreen hides the traffic lights; drop the titlebar inset that
    // reserves space for them (styles.css keys off this attribute).
    window.tiger?.onFullscreen?.((state) => {
      document.documentElement.dataset.fullscreen = state ? 'true' : 'false'
    })
  }, [])

  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = resolveDark(settings.theme) ? 'dark' : 'light'
    }
    apply()
    document.documentElement.style.setProperty('--code-size', `${settings.fontSize}px`)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    if (settings.theme === 'system') {
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }
  }, [settings.theme, settings.fontSize])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
    if (patch.analyticsEnabled !== undefined) setAnalyticsEnabled(patch.analyticsEnabled)
    window.tiger?.setSettings(patch).then(setSettings)
  }, [])

  // Ref so refreshGitStates can read the freshest collections without being
  // re-created (and thus re-firing its effect) on every keystroke-driven
  // collections rebuild.
  const collectionsRef = useRef(collections)
  collectionsRef.current = collections

  const refreshGitStates = useCallback(async () => {
    if (!window.tiger?.git) return
    const available = await window.tiger.git.check()
    if (!available.ok) return
    const diskCollections = collectionsRef.current.filter((c) => c.root)
    const states = await Promise.all(
      diskCollections.map(async (c) => {
        const s = await window.tiger!.git.status(c.root!)
        return [
          c.id,
          {
            isRepo: s.isRepo,
            dirtyCount: s.dirtyCount,
            ahead: s.ahead,
            behind: s.behind,
            hasRemote: s.hasRemote,
            hasUpstream: s.hasUpstream
          }
        ] as const
      })
    )
    setGitStates(Object.fromEntries(states))
  }, [])

  // Only the set of disk roots affects git status; key the effect on that
  // stable string so renames/url edits (which rebuild collections) don't
  // re-trigger a status sweep on every keystroke.
  const diskRootsKey = collections
    .filter((c) => c.root)
    .map((c) => c.root)
    .sort()
    .join('\n')

  // Sync indicators: refresh when the disk roots change and on a slow heartbeat.
  useEffect(() => {
    refreshGitStates()
    const timer = setInterval(refreshGitStates, 60000)
    // Team sync from the collection page or dialog updates the sidebar at once.
    const stop = onGitChanged(() => void refreshGitStates())
    return () => {
      clearInterval(timer)
      stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diskRootsKey, refreshGitStates])

  /**
   * A git op (pull / checkout / discard / sync) just rewrote this collection's
   * .tiger files on disk. Drop the in-memory copies and their saved-text
   * baselines so they reload from disk. Otherwise the stale in-memory request
   * stays "clean" and a later Cmd+S overwrites whatever the teammate just
   * pulled in. The active request is re-read immediately so the editor reflects
   * the new content without the user clicking away and back.
   */
  const invalidateCollectionCache = useCallback(
    async (colId: string) => {
      const col = collections.find((c) => c.id === colId)
      if (!col) return
      const ids = new Set(col.entries.map((e) => e.id))
      setRequestsById((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !ids.has(k))))
      for (const id of ids) delete savedText.current[id]
      // Re-read the open request straight from disk so the editor reflects the
      // pulled content immediately (loadRequest would short-circuit on the
      // still-cached copy, so read + commit directly here).
      if (activeId && ids.has(activeId) && pathById[activeId] && window.tiger) {
        try {
          const parsed = parseRequest(await window.tiger.readFile(pathById[activeId]))
          savedText.current[activeId] = serializeRequest(parsed)
          editedIds.current.delete(activeId)
          setRequestsById((prev) => ({ ...prev, [activeId]: parsed }))
        } catch {
          /* file removed by the git op; leave it dropped */
        }
      }
    },
    [collections, activeId, pathById]
  )

  const fKey = (colId: string, path: string[]): string => `${colId}${SEP}${path.join('/')}`
  const folderAuth = (colId: string, path: string[]): TigerAuth | undefined =>
    folderSettings[fKey(colId, path)]?.auth
  const folderDocs = (colId: string, path: string[]): string | undefined =>
    folderSettings[fKey(colId, path)]?.docs

  const active = activeId ? requestsById[activeId] : undefined
  const activeCollection = activeId
    ? collections.find((c) => c.entries.some((e) => e.id === activeId))
    : undefined
  const activeEntry = activeCollection?.entries.find((e) => e.id === activeId)
  /**
   * The request with auth inheritance applied: its own auth, else its folder's
   * default auth, else the collection default (Postman/Bruno semantics).
   */
  const inheritedAuth =
    (activeCollection && activeEntry ? folderAuth(activeCollection.id, activeEntry.folderPath) : undefined) ??
    activeCollection?.auth
  const activeEffective = active
    ? { ...active, auth: resolveAuth(active, inheritedAuth) }
    : undefined

  const loadRequest = useCallback(
    async (id: string): Promise<TigerRequest | undefined> => {
      if (requestsById[id]) return requestsById[id]
      if (pathById[id] && window.tiger) {
        try {
          const parsed = parseRequest(await window.tiger.readFile(pathById[id]))
          savedText.current[id] = serializeRequest(parsed)
          editedIds.current.delete(id)
          setRequestsById((prev) => ({ ...prev, [id]: parsed }))
          return parsed
        } catch {
          return undefined
        }
      }
      return undefined
    },
    [requestsById, pathById]
  )

  /** Register a tab (no-op when already open). */
  const openTab = useCallback((t: OpenTab) => {
    setOpenTabs((prev) => (prev.some((x) => tabKey(x) === tabKey(t)) ? prev : [...prev, t]))
  }, [])

  const selectRequest = useCallback(
    async (id: string) => {
      openTab({ kind: 'request', id })
      setActiveId(id)
      setView('workspace')
      setInspect(null)
      await loadRequest(id)
    },
    [loadRequest, openTab]
  )

  /** Activate any tab kind (used when selecting and when closing a neighbor). */
  const activateTab = useCallback(
    async (t: OpenTab) => {
      setView('workspace')
      if (t.kind === 'request') {
        setInspect(null)
        setActiveId(t.id)
        await loadRequest(t.id)
      } else if (t.kind === 'collection') {
        setInspect({ type: 'collection', colId: t.colId })
        setColHistory((await window.tiger?.historyRead()) ?? [])
      } else {
        setInspect({ type: 'folder', colId: t.colId, path: t.path })
        // Load this folder's saved auth/docs from folder.tiger on first visit.
        const col = collectionsRef.current.find((c) => c.id === t.colId)
        const key = `${t.colId}${SEP}${t.path.join('/')}`
        if (col?.root && window.tiger) {
          window.tiger
            .readFile(`${col.root}/${t.path.join('/')}/folder.tiger`)
            .then((text) => {
              const parsed = parseCollectionSettings(text)
              setFolderSettings((prev) =>
                prev[key] ? prev : { ...prev, [key]: { auth: parsed.auth, docs: parsed.docs } }
              )
            })
            .catch(() => {
              /* no folder.tiger yet */
            })
        }
      }
    },
    [loadRequest]
  )

  /**
   * Session restore, two-phase: (1) on mount reopen every persisted root via
   * the dialog-less openPath and apply the payloads; (2) once those
   * collections are in state, resolve the persisted tabs against what really
   * opened and activate the saved tab. Two phases because activating right
   * after applying would close over the not-yet-flushed pathById/collections.
   */
  const sessionRestored = useRef(false)
  const [pendingRestore, setPendingRestore] = useState<{
    tabs: OpenTab[]
    activeKey: string | null
    roots: string[]
  } | null>(null)

  useEffect(() => {
    if (bootDemo) {
      sessionRestored.current = true
      return
    }
    let cancelled = false
    ;(async () => {
      const roots = parseStoredRoots(readStored(SESSION_KEYS.roots))
      const payloads = await Promise.all(roots.map((r) => window.tiger!.openPath(r)))
      if (cancelled) return
      const openedRoots: string[] = []
      for (const payload of payloads) {
        if (payload) {
          applyOpenedCollection(payload)
          openedRoots.push(payload.root)
        }
      }
      if (!openedRoots.length) {
        // Every persisted root is gone: fall back to the demo bootstrap.
        setCollections([DEMO_COLLECTION])
        setRequestsById(Object.fromEntries(sampleRequests.map((r) => [r.id, r.request])))
        if (sampleRequests[0]) {
          setOpenTabs([{ kind: 'request', id: sampleRequests[0].id }])
          setActiveId(sampleRequests[0].id)
        }
        setActiveEnvKey(`demo${SEP}Demo`)
        setActiveEnv(sampleEnvironment)
        sessionRestored.current = true
        return
      }
      setPendingRestore({
        tabs: parseStoredTabs(readStored(SESSION_KEYS.tabs)),
        activeKey: readStored(SESSION_KEYS.active) || null,
        roots: openedRoots
      })
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!pendingRestore) return
    if (!pendingRestore.roots.every((r) => collections.some((c) => c.id === r))) return
    const shapes = collections
      .filter((c) => c.root)
      .map((c) => ({
        colId: c.id,
        entryIds: new Set(c.entries.map((e) => e.id)),
        folderKeys: new Set(c.entries.map((e) => e.folderPath.join('/')))
      }))
    const valid = resolveStoredTabs(pendingRestore.tabs, shapes)
    setOpenTabs(valid)
    const target =
      valid.find((t) => tabKey(t) === pendingRestore.activeKey) ?? valid[valid.length - 1]
    if (target) {
      activateTab(target)
    } else {
      setActiveId(null)
      setInspect(null)
    }
    sessionRestored.current = true
    setPendingRestore(null)
  }, [pendingRestore, collections, activateTab])

  /** The key of the tab currently shown, derived from activeId/inspect. */
  const activeTabKey =
    inspect?.type === 'collection'
      ? `c:${inspect.colId}`
      : inspect?.type === 'folder'
        ? `f:${inspect.colId}${SEP}${inspect.path.join('/')}`
        : activeId
          ? `r:${activeId}`
          : null

  const closeTab = useCallback(
    (key: string) => {
      const index = openTabs.findIndex((t) => tabKey(t) === key)
      if (index === -1) return
      const next = openTabs.filter((t) => tabKey(t) !== key)
      setOpenTabs(next)
      // Closing the active tab activates its neighbor; empty state when none.
      if (activeTabKey === key) {
        const neighbor = next[Math.min(index, next.length - 1)]
        if (neighbor) activateTab(neighbor)
        else {
          setActiveId(null)
          setInspect(null)
        }
      }
    },
    [openTabs, activeTabKey, activateTab]
  )

  const updateActive = useCallback(
    (request: TigerRequest) => {
      if (!activeId) return
      // Cheap dirty flag for large bodies, where serializing per keystroke lags.
      editedIds.current.add(activeId)
      setRequestsById((prev) => ({ ...prev, [activeId]: request }))
      // Keep the sidebar entry's name and method in sync with the editor, but
      // only rebuild collections when one of those actually changed. Otherwise
      // every keystroke in the URL/body produces a new collections array, which
      // needlessly re-runs effects keyed on it (e.g. refreshGitStates).
      setCollections((prev) => {
        const entry = prev.flatMap((c) => c.entries).find((e) => e.id === activeId)
        if (entry && entry.name === request.name && entry.method === request.method) return prev
        return prev.map((col) => ({
          ...col,
          entries: col.entries.map((e) =>
            e.id === activeId ? { ...e, name: request.name, method: request.method } : e
          )
        }))
      })
    },
    [activeId]
  )

  const setCollectionEnvironments = useCallback(
    (colId: string, environments: EnvRef[]) => {
      setCollections((prev) => prev.map((c) => (c.id === colId ? { ...c, environments } : c)))
      // Keep the active environment fresh if it was edited.
      if (activeEnvKey?.startsWith(`${colId}${SEP}`)) {
        const name = activeEnvKey.slice(activeEnvKey.indexOf(SEP) + SEP.length)
        const ref = environments.find((e) => e.name === name)
        if (ref?.data) setActiveEnv(ref.data)
        else if (!ref) {
          setActiveEnvKey(null)
          setActiveEnv(null)
        }
      }
    },
    [activeEnvKey]
  )

  /**
   * Merge captured variables into the active environment (update by name or
   * append enabled) and persist: write the env file when disk-backed, else
   * update the in-memory ref via setCollectionEnvironments.
   *
   * Reads the latest env from activeEnvRef and updates state functionally, so
   * captures from a slow send never clobber an env the user (or a second send)
   * changed in the meantime; the disk write uses that same merged result so
   * state and file stay consistent.
   */
  const applyCaptures = useCallback(
    (captured: Array<{ name: string; value: string }>) => {
      if (!captured.length) return
      const { key, env } = activeEnvRef.current
      if (!env || !key) {
        toast('Captured values need an active environment')
        return
      }
      const merge = (base: TigerEnvironment): TigerEnvironment => {
        const variables = [...base.variables]
        for (const { name, value } of captured) {
          const idx = variables.findIndex((v) => v.name === name)
          if (idx !== -1) variables[idx] = { ...variables[idx], value }
          else variables.push({ name, value, enabled: true })
        }
        return { ...base, variables }
      }
      // Compute the persisted value off the latest snapshot, then commit the
      // same merge to state functionally so nothing in between is lost.
      const next = merge(env)
      activeEnvRef.current = { key, env: next }
      setActiveEnv((cur) => (cur ? merge(cur) : next))
      const sep = key.indexOf(SEP)
      const colId = key.slice(0, sep)
      const envName = key.slice(sep + SEP.length)
      const col = collections.find((c) => c.id === colId)
      const ref = col?.environments.find((e) => e.name === envName)
      if (ref?.path && window.tiger) {
        window.tiger.writeFile(ref.path, serializeEnvironment(next))
      } else if (col && ref) {
        setCollectionEnvironments(
          colId,
          col.environments.map((e) => (e.name === envName ? { ...e, data: next } : e))
        )
      }
      toast(`Captured: ${captured.map((c) => c.name).join(', ')}`)
    },
    [collections, setCollectionEnvironments, toast]
  )

  /** Variables the script changed vs the env it started from, for persistence. */
  const scriptVarDelta = (before: Record<string, string>, after: Record<string, string>) =>
    Object.entries(after)
      .filter(([k, v]) => before[k] !== v)
      .map(([name, value]) => ({ name, value }))

  const send = useCallback(async () => {
    if (!activeId || !active) return
    const id = activeId
    if (sendingIds.has(id)) return
    setSendingIds((prev) => new Set(prev).add(id))
    setResponses((prev) => ({ ...prev, [id]: { loading: true } }))
    try {
      // Pre-request script: may set variables used for interpolation this send.
      let envForSend = activeEnv
      const baseVars = envToVars(activeEnv)
      if (active.preScript?.trim()) {
        const pre = await runScriptIsolated(active.preScript, { vars: baseVars })
        if (pre.error) toast(`Pre-request script error: ${pre.error}`)
        const delta = scriptVarDelta(baseVars, pre.vars)
        if (delta.length) {
          envForSend = {
            name: activeEnv?.name ?? 'env',
            variables: Object.entries(pre.vars).map(([name, value]) => ({
              name,
              value,
              enabled: true
            }))
          }
          applyCaptures(delta)
        }
      }

      const effective = activeEffective ?? active
      const data = await runRequest(effective, envForSend, settings.timeoutMs, id)
      if (!deletedIds.current.has(id)) {
        let tests: ScriptTestResult[] | undefined
        let logs: string[] | undefined
        // Capture blocks first, then the post-response script.
        if (active.captures?.length) {
          applyCaptures(
            extractCaptures(active.captures, {
              status: data.status,
              headers: data.headers,
              body: data.raw
            })
          )
        }
        if (active.postScript?.trim()) {
          const post = await runScriptIsolated(active.postScript, {
            vars: envToVars(envForSend),
            response: {
              status: data.status,
              headers: data.headers,
              body: data.raw,
              timeMs: data.timeMs
            }
          })
          if (post.error) toast(`Post-response script error: ${post.error}`)
          const delta = scriptVarDelta(envToVars(envForSend), post.vars)
          if (delta.length) applyCaptures(delta)
          tests = post.tests.length ? post.tests : undefined
          logs = post.logs.length ? post.logs : undefined
          if (post.tests.length) {
            const passed = post.tests.filter((t) => t.passed).length
            const failed = post.tests.length - passed
            toast(
              failed
                ? `Tests: ${passed} passed, ${failed} failed`
                : `Tests: ${passed} passed`
            )
          }
        }
        setResponses((prev) => ({ ...prev, [id]: { loading: false, data, tests, logs } }))
        announce(
          `Response ${data.status}${data.statusText ? ` ${data.statusText}` : ''} in ${data.timeMs} ms`,
          { assertive: !data.ok }
        )
      }
      trackEvent(events.requestSent(active.method, data.status, data.ok))
    } catch (e) {
      if (!deletedIds.current.has(id)) {
        setResponses((prev) => ({ ...prev, [id]: { loading: false, error: (e as Error).message } }))
        announce(`Request failed: ${(e as Error).message}`, { assertive: true })
      }
    } finally {
      setSendingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }, [activeId, active, activeEffective, activeEnv, settings.timeoutMs, sendingIds, applyCaptures, toast])

  const save = useCallback(async () => {
    if (!activeId || !active) return
    const path = pathById[activeId]
    if (path && window.tiger) {
      const text = serializeRequest(active)
      await window.tiger.writeFile(path, text)
      savedText.current[activeId] = text
      editedIds.current.delete(activeId)
      toast('Saved')
    }
  }, [activeId, active, pathById, toast])

  const cancelActive = useCallback(() => {
    if (activeId) cancelRequest(activeId)
  }, [activeId])

  /** Close whatever tab is showing (request, collection or folder page). */
  const closeActiveTab = useCallback(() => {
    if (activeTabKey) closeTab(activeTabKey)
  }, [activeTabKey, closeTab])

  /** Every request in the runner scope, with auth inheritance applied. */
  const loadRunnerItems = useCallback(async (): Promise<RunnerItem[]> => {
    if (!runnerScope) return []
    const col = collectionsRef.current.find((c) => c.id === runnerScope.colId)
    if (!col) return []
    const scopeKey = runnerScope.path?.join('/')
    const entries = col.entries.filter(
      (e) => scopeKey === undefined || e.folderPath.join('/') === scopeKey
    )
    const items: RunnerItem[] = []
    for (const e of entries) {
      const request = await loadRequest(e.id)
      if (!request) continue
      const inherited =
        folderSettingsRef.current[`${col.id}${SEP}${e.folderPath.join('/')}`]?.auth ?? col.auth
      items.push({ id: e.id, name: e.name, request: { ...request, auth: resolveAuth(request, inherited) } })
    }
    return items
  }, [runnerScope, loadRequest])

  /** Close every tab except the given one; it becomes active. */
  const closeOtherTabs = useCallback(
    (key: string) => {
      const keep = openTabs.find((t) => tabKey(t) === key)
      if (!keep) return
      setOpenTabs([keep])
      if (activeTabKey !== key) activateTab(keep)
    },
    [openTabs, activeTabKey, activateTab]
  )

  const closeAllTabs = useCallback(() => {
    setOpenTabs([])
    setActiveId(null)
    setInspect(null)
  }, [])

  const closeTabsToRight = useCallback(
    (key: string) => {
      const index = openTabs.findIndex((t) => tabKey(t) === key)
      if (index === -1) return
      const next = openTabs.slice(0, index + 1)
      setOpenTabs(next)
      if (!next.some((t) => tabKey(t) === activeTabKey)) activateTab(next[index])
    },
    [openTabs, activeTabKey, activateTab]
  )

  /** Key-based reorder: rendered tabs can be a filtered subset of openTabs. */
  const reorderTabs = useCallback(
    (sourceKey: string, targetKey: string, side: 'before' | 'after') => {
      setOpenTabs((prev) => {
        const from = prev.findIndex((t) => tabKey(t) === sourceKey)
        if (from === -1 || sourceKey === targetKey) return prev
        const copy = [...prev]
        const [moved] = copy.splice(from, 1)
        const to = copy.findIndex((t) => tabKey(t) === targetKey)
        if (to === -1) return prev
        copy.splice(side === 'before' ? to : to + 1, 0, moved)
        return copy
      })
    },
    []
  )

  /** Cmd/Ctrl+1..8 jump to the Nth visible tab; 9 jumps to the last one. */
  const jumpToTab = useCallback(
    (n: number) => {
      const entryIds = new Set(collectionsRef.current.flatMap((c) => c.entries.map((e) => e.id)))
      const colIds = new Set(collectionsRef.current.map((c) => c.id))
      const visible = openTabs.filter((t) =>
        t.kind === 'request' ? entryIds.has(t.id) : colIds.has(t.colId)
      )
      const target = n === 9 ? visible[visible.length - 1] : visible[n - 1]
      if (target) activateTab(target)
    },
    [openTabs, activateTab]
  )

  /** Ask the sidebar to expand ancestors and flash a request row. */
  const revealSeq = useRef(0)
  const [sidebarReveal, setSidebarReveal] = useState<{ id: string; nonce: number } | null>(null)

  const openTabMenu = useCallback(
    (key: string, x: number, y: number) => {
      const tab = openTabs.find((t) => tabKey(t) === key)
      if (!tab) return
      const index = openTabs.findIndex((t) => tabKey(t) === key)
      const items: MenuItem[] = [
        { label: 'Close', icon: <CloseIcon size={14} />, onClick: () => closeTab(key) }
      ]
      if (openTabs.length > 1) {
        items.push({
          label: 'Close others',
          icon: <ListXIcon size={14} />,
          onClick: () => closeOtherTabs(key)
        })
      }
      if (index < openTabs.length - 1) {
        items.push({
          label: 'Close to the right',
          icon: <ArrowRightToLineIcon size={14} />,
          onClick: () => closeTabsToRight(key)
        })
      }
      items.push({
        label: 'Close all',
        icon: <XCircleIcon size={14} />,
        onClick: () => closeAllTabs()
      })
      if (tab.kind === 'request') {
        items.push('sep', {
          label: 'Reveal in sidebar',
          icon: <LocateIcon size={14} />,
          onClick: () => setSidebarReveal({ id: tab.id, nonce: ++revealSeq.current })
        })
      }
      setCtxMenu({ x, y, items, label: 'Tab actions' })
    },
    [openTabs, closeTab, closeOtherTabs, closeTabsToRight, closeAllTabs]
  )

  /** Cycle to the neighboring tab (Ctrl+Tab / Ctrl+Shift+Tab). */
  const cycleTab = useCallback(
    (dir: 1 | -1) => {
      if (openTabs.length < 2 || !activeTabKey) return
      const index = openTabs.findIndex((t) => tabKey(t) === activeTabKey)
      const next = openTabs[(index + dir + openTabs.length) % openTabs.length]
      if (next) activateTab(next)
    },
    [openTabs, activeTabKey, activateTab]
  )

  const toggleSidebar = useCallback(() => {
    setSidebarHidden((hidden) => {
      writeStored('tiger.sidebarHidden', hidden ? '0' : '1')
      return !hidden
    })
  }, [])

  /** New request in the collection of the active request, else the first one.
   * newRequest is declared later in the component, so go through a ref. */
  const newRequestRef = useRef<(collectionId: string, folderPath?: string[]) => void>(() => {})
  const newRequestShortcut = useCallback(() => {
    const colId = activeCollection?.id ?? collections[0]?.id
    if (colId) newRequestRef.current(colId)
  }, [activeCollection, collections])

  useEffect(() => {
    const isMac = /Mac/i.test(navigator.platform)
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+Tab cycles tabs on every platform (with Shift: backwards). Checked
      // before the modifier gate below, which would drop it on macOS.
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        cycleTab(e.shiftKey ? -1 : 1)
        return
      }
      // Strictly the platform's command modifier: Cmd on macOS (Ctrl+K/T/… must
      // keep their emacs-style text-editing meaning in inputs), Ctrl elsewhere
      // (the Windows key must never trigger app shortcuts).
      if (!(isMac ? e.metaKey : e.ctrlKey)) return
      // While the palette is open it owns the keyboard, except the toggle.
      if (paletteOpen && e.key.toLowerCase() !== 'k') return
      if (/^[1-9]$/.test(e.key) && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        jumpToTab(Number(e.key))
        return
      }
      const key = e.key.toLowerCase()
      if (key === 's') {
        e.preventDefault()
        save()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        send()
      } else if (key === 'k') {
        e.preventDefault()
        setPaletteOpen((open) => !open)
      } else if (key === 'w' && !window.tiger) {
        // In Electron the main process intercepts Cmd+W (the menu owns it);
        // this fallback covers the browser preview.
        e.preventDefault()
        closeActiveTab()
      } else if (key === 'b' && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        toggleSidebar()
      } else if (key === 't') {
        e.preventDefault()
        newRequestShortcut()
      } else if (key === 'l') {
        e.preventDefault()
        const url = document.querySelector<HTMLInputElement>('.url-input')
        url?.focus()
        url?.select()
      } else if (e.key === '/' || e.key === '?') {
        e.preventDefault()
        setModal((m) => (m === 'shortcuts' ? 'none' : 'shortcuts'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, send, paletteOpen, cycleTab, closeActiveTab, newRequestShortcut, jumpToTab, toggleSidebar])

  // Cmd+W arrives from the main process (it must block the menu accelerator).
  // Native menu items (menu.ts) fan out through the shortcut channel. The ref is
  // repopulated each render with the latest callbacks, while the IPC listener is
  // registered exactly once so menu clicks always hit current handlers.
  const menuActionsRef = useRef<Record<string, () => void>>({})
  useEffect(() => {
    window.tiger?.onShortcut?.((name) => {
      menuActionsRef.current[name]?.()
    })
  }, [])

  /** Turn an opened-collection payload into state; shared by dialog, clone and restore. */
  const applyOpenedCollection = useCallback(
    (opened: OpenedCollection): SidebarEntry[] => {
      const entries: SidebarEntry[] = opened.requests.map((r) => ({
        id: `${opened.root}${SEP}${r.path}`,
        name: r.name,
        method: r.method,
        folderPath: r.folder
      }))
      reviveIds(entries.map((e) => e.id))
      const next: CollectionState = {
        id: opened.root,
        name: opened.settings?.name || opened.name,
        root: opened.root,
        entries,
        environments: opened.environments.map((e) => ({ name: e.name, path: e.path })),
        auth: opened.settings?.auth,
        docs: opened.settings?.docs
      }
      setCollections((prev) => {
        const existing = prev.findIndex((c) => c.id === next.id)
        if (existing !== -1) {
          const copy = [...prev]
          copy[existing] = next
          return copy
        }
        return [...prev, next]
      })
      setPathById((prev) => ({
        ...prev,
        ...Object.fromEntries(opened.requests.map((r) => [`${opened.root}${SEP}${r.path}`, r.path]))
      }))
      return entries
    },
    [reviveIds]
  )

  const openCollection = useCallback(async () => {
    const opened = await window.tiger?.openCollection()
    if (!opened) return
    const entries = applyOpenedCollection(opened)
    if (entries[0]) selectRequest(entries[0].id)
  }, [selectRequest, reviveIds])

  const newCollection = useCallback(() => setNewCollectionOpen(true), [])
  const runNewCollection = useCallback(
    async (name: string) => {
      setNewCollectionOpen(false)
      if (!window.tiger?.newCollection) {
        toast('Creating a collection needs the desktop app')
        return
      }
      const opened = await window.tiger.newCollection(name)
      if (!opened) return
      const entries = applyOpenedCollection(opened)
      if (entries[0]) selectRequest(entries[0].id)
      toast(`Created ${opened.name}`)
    },
    [selectRequest, applyOpenedCollection, toast]
  )

  const importFromCurl = useCallback(
    async (command: string) => {
      const req = importCurl(command)
      if (!req) {
        toast('Could not parse that as a curl command')
        return
      }
      const target = collections[0]
      if (!target) {
        toast('Open or create a collection first, then import')
        return
      }
      let id: string
      // Persist to disk like newRequest does when the target lives on disk, so
      // the imported request survives a reload and shows up in Git.
      if (target.root && window.tiger) {
        const path = `${target.root}/curl-${Date.now()}.tiger`
        id = `${target.id}${SEP}${path}`
        const text = serializeRequest(req)
        await window.tiger.writeFile(path, text)
        savedText.current[id] = text
        editedIds.current.delete(id)
        setPathById((prev) => ({ ...prev, [id]: path }))
      } else {
        id = `${target.id}${SEP}curl-${Date.now()}`
      }
      reviveIds([id])
      setRequestsById((prev) => ({ ...prev, [id]: req }))
      setCollections((prev) =>
        prev.map((c) =>
          c.id === target.id
            ? { ...c, entries: [...c.entries, { id, name: req.name, method: req.method, folderPath: [] }] }
            : c
        )
      )
      openTab({ kind: 'request', id })
      setActiveId(id)
      setModal('none')
      setView('workspace')
      toast('Request imported from curl')
    },
    [collections, openTab, reviveIds, toast]
  )

  const cloneCollection = useCallback(() => setCloneOpen(true), [])

  /** The join dialog cloned it (and kept any error on screen); open it here. */
  const onJoinedTeam = useCallback(
    (opened: OpenedCollection) => {
      setCloneOpen(false)
      const entries = applyOpenedCollection(opened)
      if (entries[0]) selectRequest(entries[0].id)
      toast(`Joined ${opened.name}. Use Sync to get your team's latest changes.`)
    },
    [selectRequest, reviveIds, toast]
  )

  const loadImport = useCallback(
    (kind: ImportKind) => {
      window.tiger
        ?.importCollection(kind)
        .then((result) => {
          if (!result) return
          if (result.requests.length === 0) {
            toast(`No importable requests found in ${result.name}`)
            return
          }
          const colId = `import-${++importCount.current}`
          const entries: SidebarEntry[] = result.requests.map((r, i) => ({
            id: `${colId}${SEP}${i}`,
            name: r.request.name,
            method: r.request.method,
            folderPath: r.path
          }))
          reviveIds(entries.map((e) => e.id))
          setCollections((prev) => [
            ...prev,
            { id: colId, name: result.name, entries, environments: result.environments ?? [] }
          ])
          setRequestsById((prev) => ({
            ...prev,
            ...Object.fromEntries(result.requests.map((r, i) => [`${colId}${SEP}${i}`, r.request]))
          }))
          setModal('none')
          if (entries[0]) {
            openTab({ kind: 'request', id: entries[0].id })
            setActiveId(entries[0].id)
          }
          toast(`Imported ${entries.length} requests from ${result.name}`)
          trackEvent(events.collectionImported(result.source, result.requests.length))
        })
        .catch((err: unknown) =>
          toast(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
        )
    },
    [openTab, reviveIds, toast]
  )

  const doExport = useCallback(
    async (format: ExportFormat) => {
      try {
        if (format === 'postman') {
          const col = activeCollection
          if (!col) return
          const loaded = await Promise.all(
            col.entries.map(async (e) => ({ entry: e, request: await loadRequest(e.id) }))
          )
          const imported: ImportedRequest[] = loaded
            .filter((x): x is { entry: SidebarEntry; request: TigerRequest } => !!x.request)
            .map((x) => ({ path: x.entry.folderPath, request: x.request }))
          const json = JSON.stringify(exportPostman(col.name, imported, activeEnv), null, 2)
          const filename = `${col.name}.postman_collection.json`
          if (window.tiger) {
            const path = await window.tiger.exportCollection(filename, json)
            if (path) toast(`Exported to ${path}`)
          } else {
            downloadText(filename, json)
              ? toast(`Downloaded ${filename}`)
              : toast('Export needs the desktop app')
          }
        } else if (format === 'openapi') {
          const col = activeCollection
          if (!col) return
          const loaded = await Promise.all(
            col.entries.map(async (e) => ({ entry: e, request: await loadRequest(e.id) }))
          )
          const imported: ImportedRequest[] = loaded
            .filter((x): x is { entry: SidebarEntry; request: TigerRequest } => !!x.request)
            .map((x) => ({ path: x.entry.folderPath, request: x.request }))
          const json = JSON.stringify(exportOpenApi(col.name, imported), null, 2)
          const filename = `${col.name}.openapi.json`
          if (window.tiger) {
            const path = await window.tiger.exportCollection(filename, json)
            if (path) toast(`Exported to ${path}`)
          } else {
            downloadText(filename, json)
              ? toast(`Downloaded ${filename}`)
              : toast('Export needs the desktop app')
          }
        } else if (format === 'environment') {
          if (!activeEnv) return
          const filename = `${activeEnv.name || 'environment'}.postman_environment.json`
          const json = JSON.stringify(exportPostmanEnvironment(activeEnv), null, 2)
          if (window.tiger) {
            const path = await window.tiger.exportCollection(filename, json)
            if (path) toast(`Exported to ${path}`)
          } else {
            downloadText(filename, json)
              ? toast(`Downloaded ${filename}`)
              : toast('Export needs the desktop app')
          }
        } else if (format === 'tiger' && active) {
          const filename = `${active.name || 'request'}.tiger`
          const text = serializeRequest(active)
          if (window.tiger) {
            const path = await window.tiger.exportCollection(filename, text)
            if (path) toast(`Exported to ${path}`)
          } else {
            downloadText(filename, text)
              ? toast(`Downloaded ${filename}`)
              : toast('Export needs the desktop app')
          }
        } else if (format === 'curl' && active) {
          await navigator.clipboard.writeText(toCurl(buildRequest(active, envToVars(activeEnv))))
          toast('curl command copied')
        }
        setModal('none')
      } catch (e) {
        toast(`Export failed: ${(e as Error).message}`)
      }
    },
    [activeCollection, active, activeEnv, loadRequest, toast]
  )

  const newRequest = useCallback(
    async (collectionId: string, folderPath: string[] = []) => {
      const col = collections.find((c) => c.id === collectionId)
      if (!col) return
      const request: TigerRequest = {
        name: 'New request',
        method: 'get',
        url: '',
        query: [],
        headers: [],
        body: { type: 'none', content: '' }
      }
      let id: string
      if (col.root && window.tiger) {
        const dir = [col.root, ...folderPath].join('/')
        const path = `${dir}/new-request-${Date.now()}.tiger`
        id = `${col.id}${SEP}${path}`
        const text = serializeRequest(request)
        await window.tiger.writeFile(path, text)
        savedText.current[id] = text
        editedIds.current.delete(id)
        setPathById((prev) => ({ ...prev, [id]: path }))
      } else {
        id = `${col.id}${SEP}new-${Date.now()}`
      }
      reviveIds([id])
      setRequestsById((prev) => ({ ...prev, [id]: request }))
      setCollections((prev) =>
        prev.map((c) =>
          c.id === collectionId
            ? {
                ...c,
                entries: [
                  ...c.entries,
                  { id, name: request.name, method: 'get' as HttpMethod, folderPath }
                ]
              }
            : c
        )
      )
      openTab({ kind: 'request', id })
      setActiveId(id)
      setView('workspace')
      setInspect(null)
    },
    [collections, openTab, reviveIds]
  )
  newRequestRef.current = newRequest

  const duplicateRequest = useCallback(
    async (entryId: string) => {
      const source = requestsById[entryId] ?? (await loadRequest(entryId))
      const col = collections.find((c) => c.entries.some((e) => e.id === entryId))
      const entry = col?.entries.find((e) => e.id === entryId)
      if (!source || !col || !entry) return

      const clone: TigerRequest = JSON.parse(JSON.stringify({ ...source, seq: undefined }))
      clone.name = `${source.name} copy`

      let id: string
      const sourcePath = pathById[entryId]
      if (col.root && window.tiger && sourcePath) {
        const cut = Math.max(sourcePath.lastIndexOf('/'), sourcePath.lastIndexOf('\\'))
        const dir = sourcePath.slice(0, cut)
        const path = `${dir}/copy-${Date.now()}.tiger`
        id = `${col.id}${SEP}${path}`
        const text = serializeRequest(clone)
        await window.tiger.writeFile(path, text)
        savedText.current[id] = text
        editedIds.current.delete(id)
        setPathById((prev) => ({ ...prev, [id]: path }))
      } else {
        id = `${col.id}${SEP}dup-${Date.now()}`
      }
      reviveIds([id])
      setRequestsById((prev) => ({ ...prev, [id]: clone }))
      setCollections((prev) =>
        prev.map((c) =>
          c.id === col.id
            ? {
                ...c,
                entries: [
                  ...c.entries,
                  { id, name: clone.name, method: clone.method, folderPath: entry.folderPath }
                ]
              }
            : c
        )
      )
      openTab({ kind: 'request', id })
      setActiveId(id)
      setView('workspace')
      toast('Request duplicated')
    },
    [requestsById, loadRequest, collections, pathById, openTab, reviveIds, toast]
  )

  /** Rename a request: the name lives in the file's meta block. */
  const renameRequest = useCallback(
    async (entryId: string, name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const source = requestsById[entryId] ?? (await loadRequest(entryId))
      if (!source || source.name === trimmed) return
      const updated = { ...source, name: trimmed }
      setRequestsById((prev) => ({ ...prev, [entryId]: updated }))
      setCollections((prev) =>
        prev.map((c) => ({
          ...c,
          entries: c.entries.map((e) => (e.id === entryId ? { ...e, name: trimmed } : e))
        }))
      )
      const path = pathById[entryId]
      if (path && window.tiger) {
        const text = serializeRequest(updated)
        await window.tiger.writeFile(path, text)
        savedText.current[entryId] = text
        editedIds.current.delete(entryId)
      }
      toast('Renamed')
    },
    [requestsById, loadRequest, pathById, toast]
  )

  /** Move a request into another folder (or the root) of the same collection. */
  const moveRequest = useCallback(
    async (entryId: string, colId: string, targetFolder: string[]) => {
      const col = collectionsRef.current.find((c) => c.id === colId)
      const entry = col?.entries.find((e) => e.id === entryId)
      if (!col || !entry) return
      if (entry.folderPath.join('/') === targetFolder.join('/')) return
      const fromPath = pathById[entryId]
      if (col.root && window.tiger && fromPath) {
        const toPath = movedRequestPath(col.root, fromPath, targetFolder)
        try {
          await window.tiger.moveFile(fromPath, toPath)
        } catch (e) {
          toast(`Move failed: ${(e as Error).message}`)
          return
        }
        setPathById((prev) => ({ ...prev, [entryId]: toPath }))
      }
      setCollections((prev) =>
        prev.map((c) =>
          c.id === colId
            ? {
                ...c,
                entries: c.entries.map((e) =>
                  e.id === entryId ? { ...e, folderPath: targetFolder } : e
                )
              }
            : c
        )
      )
      toast(
        targetFolder.length
          ? `Moved to ${targetFolder[targetFolder.length - 1]}`
          : 'Moved to collection root'
      )
    },
    [pathById, toast]
  )

  /** Rename a folder: directory rename on disk plus path remaps in memory. */
  const renameFolder = useCallback(
    async (colId: string, path: string[], newName: string) => {
      const trimmed = newName.trim()
      const col = collectionsRef.current.find((c) => c.id === colId)
      if (!col || !trimmed || trimmed === path[path.length - 1]) return
      if (/[/\\]/.test(trimmed)) {
        toast('Folder names cannot contain slashes')
        return
      }
      const fromDir = col.root ? `${col.root}/${path.join('/')}` : null
      const toDir = col.root ? `${col.root}/${[...path.slice(0, -1), trimmed].join('/')}` : null
      if (fromDir && toDir && window.tiger) {
        try {
          await window.tiger.moveFile(fromDir, toDir)
        } catch (e) {
          toast(`Rename failed: ${(e as Error).message}`)
          return
        }
      }
      setCollections((prev) =>
        prev.map((c) =>
          c.id === colId
            ? {
                ...c,
                entries: c.entries.map((e) => {
                  const next = renamedFolderPath(e.folderPath, path, trimmed)
                  return next ? { ...e, folderPath: next } : e
                })
              }
            : c
        )
      )
      if (fromDir && toDir) {
        setPathById((prev) => {
          const out: Record<string, string> = {}
          for (const [k, v] of Object.entries(prev)) {
            out[k] = v.startsWith(`${fromDir}/`) ? toDir + v.slice(fromDir.length) : v
          }
          return out
        })
        setFolderSettings((prev) => {
          const out: typeof prev = {}
          const oldKey = `${colId}${SEP}${path.join('/')}`
          const newKey = `${colId}${SEP}${[...path.slice(0, -1), trimmed].join('/')}`
          for (const [k, v] of Object.entries(prev)) {
            if (k === oldKey) out[newKey] = v
            else if (k.startsWith(`${oldKey}/`)) out[newKey + k.slice(oldKey.length)] = v
            else out[k] = v
          }
          return out
        })
      }
      setOpenTabs((prev) =>
        prev.map((t) => {
          if (t.kind !== 'folder' || t.colId !== colId) return t
          const next = renamedFolderPath(t.path, path, trimmed)
          return next ? { ...t, path: next } : t
        })
      )
      setInspect((cur) => {
        if (!cur || cur.type !== 'folder' || cur.colId !== colId) return cur
        const next = renamedFolderPath(cur.path, path, trimmed)
        return next ? { ...cur, path: next } : cur
      })
      toast('Folder renamed')
    },
    [toast]
  )

  /** Duplicate a folder: copy every request in its subtree into "<name> copy". */
  const duplicateFolder = useCallback(
    async (colId: string, path: string[]) => {
      const col = collectionsRef.current.find((c) => c.id === colId)
      if (!col || !path.length) return
      const parent = path.slice(0, -1)
      const siblings = new Set(
        col.entries
          .filter(
            (e) =>
              e.folderPath.length > parent.length &&
              e.folderPath.slice(0, parent.length).join('/') === parent.join('/')
          )
          .map((e) => e.folderPath[parent.length])
      )
      const copyName = uniqueCopyName(path[path.length - 1], [...siblings])
      const inSubtree = col.entries.filter(
        (e) =>
          e.folderPath.length >= path.length &&
          e.folderPath.slice(0, path.length).join('/') === path.join('/')
      )
      const added: SidebarEntry[] = []
      const newRequests: Record<string, TigerRequest> = {}
      for (const e of inSubtree) {
        const source = requestsById[e.id] ?? (await loadRequest(e.id))
        if (!source) continue
        const clone: TigerRequest = JSON.parse(JSON.stringify(source))
        const newFolder = [...parent, copyName, ...e.folderPath.slice(path.length)]
        let id: string
        const srcPath = pathById[e.id]
        if (col.root && window.tiger && srcPath) {
          const fileName = srcPath.slice(
            Math.max(srcPath.lastIndexOf('/'), srcPath.lastIndexOf('\\')) + 1
          )
          const newPath = [col.root, ...newFolder, fileName].join('/')
          id = `${col.id}${SEP}${newPath}`
          const text = serializeRequest(clone)
          await window.tiger.writeFile(newPath, text)
          savedText.current[id] = text
          editedIds.current.delete(id)
          setPathById((prev) => ({ ...prev, [id]: newPath }))
        } else {
          id = `${col.id}${SEP}dupf-${Date.now()}-${added.length}`
        }
        newRequests[id] = clone
        added.push({ id, name: clone.name, method: clone.method, folderPath: newFolder })
      }
      if (!added.length) return
      reviveIds(added.map((a) => a.id))
      setRequestsById((prev) => ({ ...prev, ...newRequests }))
      setCollections((prev) =>
        prev.map((c) => (c.id === colId ? { ...c, entries: [...c.entries, ...added] } : c))
      )
      toast(`Folder duplicated as "${copyName}"`)
    },
    [requestsById, loadRequest, pathById, reviveIds, toast]
  )

  const deleteRequest = useCallback(
    async (entryId: string) => {
      setConfirmDeleteId(null)
      if (pathById[entryId] && window.tiger) {
        try {
          await window.tiger.deleteFile(pathById[entryId])
        } catch (e) {
          toast(`Delete failed: ${(e as Error).message}`)
          return
        }
      }
      deletedIds.current.add(entryId)
      setCollections((prev) =>
        prev.map((c) => ({ ...c, entries: c.entries.filter((e) => e.id !== entryId) }))
      )
      setRequestsById(({ [entryId]: _drop, ...rest }) => rest)
      setPathById(({ [entryId]: _drop, ...rest }) => rest)
      setResponses(({ [entryId]: _drop, ...rest }) => rest)
      serializedCache.current.delete(entryId)
      const tabIndex = openTabs.findIndex((t) => t.kind === 'request' && t.id === entryId)
      const nextTabs = openTabs.filter((t) => !(t.kind === 'request' && t.id === entryId))
      setOpenTabs(nextTabs)
      if (activeId === entryId) {
        const neighbor = tabIndex === -1 ? undefined : nextTabs[Math.min(tabIndex, nextTabs.length - 1)]
        if (neighbor) activateTab(neighbor)
        else setActiveId(null)
      }
      toast('Request deleted')
    },
    [pathById, activeId, openTabs, activateTab, toast]
  )

  const closeCollection = useCallback(
    (collectionId: string) => {
      const col = collections.find((c) => c.id === collectionId)
      if (!col) return
      const ids = new Set(col.entries.map((e) => e.id))
      for (const id of ids) {
        deletedIds.current.add(id)
        serializedCache.current.delete(id)
      }
      setCollections((prev) => prev.filter((c) => c.id !== collectionId))
      setRequestsById((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !ids.has(k))))
      setPathById((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !ids.has(k))))
      setResponses((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !ids.has(k))))
      setOpenTabs((prev) =>
        prev.filter(
          (t) =>
            !(t.kind === 'request' && ids.has(t.id)) &&
            !((t.kind === 'collection' || t.kind === 'folder') && t.colId === collectionId)
        )
      )
      if (activeId && ids.has(activeId)) setActiveId(null)
      if (activeEnvKey?.startsWith(`${collectionId}${SEP}`)) {
        setActiveEnvKey(null)
        setActiveEnv(null)
      }
    },
    [collections, activeId, activeEnvKey]
  )

  const changeEnv = useCallback(
    async (key: string) => {
      const token = ++envSeq.current
      setActiveEnvKey(key || null)
      if (!key) return setActiveEnv(null)
      const sep = key.indexOf(SEP)
      const colId = key.slice(0, sep)
      const envName = key.slice(sep + SEP.length)
      const ref = collections.find((c) => c.id === colId)?.environments.find((e) => e.name === envName)
      if (ref?.data) return setActiveEnv(ref.data)
      if (ref?.path && window.tiger) {
        try {
          const env = parseEnvironment(await window.tiger.readFile(ref.path))
          // A newer selection may have resolved while this file read was in
          // flight; only the latest selection is allowed to land.
          if (envSeq.current === token) setActiveEnv(env)
        } catch (e) {
          if (envSeq.current === token) {
            setActiveEnvKey(null)
            setActiveEnv(null)
            toast(`Could not read environment: ${(e as Error).message}`)
          }
        }
      }
    },
    [collections, toast]
  )

  /**
   * The environments modal edited an env that happens to be the active one.
   * Refresh activeEnv (prefer the data the modal already computed; fall back to
   * re-reading the file) so the next send interpolates the new values instead
   * of the stale snapshot we loaded when the env was first activated.
   */
  const reloadActiveEnv = useCallback(
    async (colId: string, name: string, data?: TigerEnvironment) => {
      if (activeEnvKey !== `${colId}${SEP}${name}`) return
      if (data) {
        setActiveEnv(data)
        return
      }
      const ref = collections.find((c) => c.id === colId)?.environments.find((e) => e.name === name)
      if (ref?.data) setActiveEnv(ref.data)
      else if (ref?.path && window.tiger) {
        try {
          setActiveEnv(parseEnvironment(await window.tiger.readFile(ref.path)))
        } catch {
          /* leave the current env in place */
        }
      }
    },
    [activeEnvKey, collections]
  )

  const requestCloseCollection = useCallback((colId: string) => setConfirmCloseId(colId), [])

  const _legacyUpdateEnvVars = useCallback(
    (variables: KeyValue[]) => {
      if (!activeEnv || !activeEnvKey) return
      const next = { ...activeEnv, variables }
      setActiveEnv(next)
      const sep = activeEnvKey.indexOf(SEP)
      const ref = collections
        .find((c) => c.id === activeEnvKey.slice(0, sep))
        ?.environments.find((e) => e.name === activeEnvKey.slice(sep + SEP.length))
      if (ref?.path && window.tiger) window.tiger.writeFile(ref.path, serializeEnvironment(next))
    },
    [activeEnv, activeEnvKey, collections]
  )
  void _legacyUpdateEnvVars


  const openHistory = useCallback(async () => {
    setHistory((await window.tiger?.historyRead()) ?? [])
    setModal('history')
  }, [])

  const clearHistory = useCallback(async () => {
    await window.tiger?.historyClear()
    setHistory([])
  }, [])

  const copyAsCurl = useCallback(
    async (entryId: string) => {
      const req = requestsById[entryId] ?? (await loadRequest(entryId))
      if (!req) return
      try {
        await navigator.clipboard.writeText(toCurl(buildRequest(req, envToVars(activeEnv))))
        toast('curl command copied')
      } catch {
        toast('Copy failed')
      }
    },
    [requestsById, loadRequest, activeEnv, toast]
  )

  const openRequestMenu = useCallback(
    (entryId: string, x: number, y: number) => {
      const items: MenuItem[] = [
        { label: 'Open', icon: <FileIcon size={14} />, onClick: () => selectRequest(entryId) },
        {
          label: 'Rename',
          icon: <PencilIcon size={14} />,
          onClick: () => setRenameTarget({ id: entryId, nonce: ++renameSeq.current })
        },
        actionItem('duplicate-request', () => duplicateRequest(entryId)),
        actionItem('copy-curl', () => copyAsCurl(entryId))
      ]
      if (pathById[entryId] && window.tiger?.reveal) {
        items.push({
          label: REVEAL_LABEL,
          icon: <FolderOpenIcon size={14} />,
          onClick: () => window.tiger!.reveal(pathById[entryId])
        })
      }
      items.push('sep', {
        label: 'Delete request…',
        icon: <TrashIcon size={14} />,
        danger: true,
        onClick: () => setConfirmDeleteId(entryId)
      })
      setCtxMenu({ x, y, items, label: 'Request actions' })
    },
    [selectRequest, duplicateRequest, copyAsCurl, pathById]
  )

  const inspectCollectionRef = useRef<(colId: string) => void>(() => {})
  /** Import and export share one dialog; each entry point says which half. */
  const openIo = useCallback((focus: 'import' | 'export') => {
    setIoFocus(focus)
    setModal('io')
  }, [])

  const openCollectionMenu = useCallback(
    (colId: string, x: number, y: number) => {
      const col = collections.find((c) => c.id === colId)
      if (!col) return
      const items: MenuItem[] = [
        actionItem('new-request', () => newRequest(colId)),
        actionItem('new-folder', () => setNewFolderIn({ colId, path: [] })),
        actionItem('run-collection', () => setRunnerScope({ colId })),
        'sep',
        {
          label: 'Collection overview',
          icon: <FileIcon size={14} />,
          onClick: () => inspectCollectionRef.current(colId)
        },
        {
          label: 'Auth for all requests…',
          icon: <PencilIcon size={14} />,
          onClick: () => setAuthColId(colId)
        },
        actionItem('export', () => openIo('export'))
      ]
      if (col.root) {
        items.push(
          actionItem('team-sync', () => setGitColId(colId)),
          {
            label: REVEAL_LABEL,
            icon: <FolderOpenIcon size={14} />,
            onClick: () => window.tiger?.reveal?.(col.root!)
          }
        )
      }
      items.push('sep', {
        label: 'Close collection',
        icon: <CloseIcon size={14} />,
        danger: true,
        // Route through the confirm path (like every other close button) so it
        // gets the confirmation dialog and inspect-view cleanup, not a raw
        // closeCollection on a possibly-stale closure.
        onClick: () => requestCloseCollection(colId)
      })
      setCtxMenu({ x, y, items, label: 'Collection actions' })
    },
    [collections, newRequest, requestCloseCollection, openIo]
  )

  const saveCollectionAuth = useCallback(
    (colId: string, auth: TigerAuth | undefined) => {
      const col = collections.find((c) => c.id === colId)
      if (!col) return
      setCollections((prev) => prev.map((c) => (c.id === colId ? { ...c, auth } : c)))
      if (col.root && window.tiger) {
        window.tiger.writeFile(
          `${col.root}/collection.tiger`,
          serializeCollectionSettings({ name: col.name, auth, docs: col.docs })
        )
      }
      toast(auth ? 'Collection auth saved' : 'Collection auth cleared')
    },
    [collections, toast]
  )

  const saveCollectionDocs = useCallback(
    (colId: string, docs: string) => {
      const col = collections.find((c) => c.id === colId)
      if (!col) return
      setCollections((prev) => prev.map((c) => (c.id === colId ? { ...c, docs } : c)))
      if (col.root && window.tiger) {
        window.tiger.writeFile(
          `${col.root}/collection.tiger`,
          serializeCollectionSettings({ name: col.name, auth: col.auth, docs })
        )
      }
      toast('Collection notes saved')
    },
    [collections, toast]
  )

  /** Persist folder-level auth/docs to state and to `<folder>/folder.tiger`. */
  const saveFolderSetting = useCallback(
    (colId: string, path: string[], patch: { auth?: TigerAuth; docs?: string }, label: string) => {
      const col = collections.find((c) => c.id === colId)
      const key = `${colId}${SEP}${path.join('/')}`
      setFolderSettings((prev) => {
        const next = { ...(prev[key] ?? {}), ...patch }
        if (col?.root && window.tiger) {
          window.tiger.writeFile(
            `${col.root}/${path.join('/')}/folder.tiger`,
            serializeCollectionSettings(next)
          )
        }
        return { ...prev, [key]: next }
      })
      toast(label)
    },
    [collections, toast]
  )

  const saveFolderAuth = useCallback(
    (colId: string, path: string[], auth: TigerAuth | undefined) =>
      saveFolderSetting(colId, path, { auth }, auth ? 'Folder auth saved' : 'Folder auth cleared'),
    [saveFolderSetting]
  )
  const saveFolderDocs = useCallback(
    (colId: string, path: string[], docs: string) =>
      saveFolderSetting(colId, path, { docs }, 'Folder notes saved'),
    [saveFolderSetting]
  )

  const inspectCollection = useCallback(
    (colId: string) => {
      openTab({ kind: 'collection', colId })
      return activateTab({ kind: 'collection', colId })
    },
    [openTab, activateTab]
  )
  inspectCollectionRef.current = inspectCollection

  const inspectFolder = useCallback(
    (colId: string, path: string[]) => {
      openTab({ kind: 'folder', colId, path })
      return activateTab({ kind: 'folder', colId, path })
    },
    [openTab, activateTab]
  )

  const openFolderMenu = useCallback(
    (colId: string, path: string[], x: number, y: number) => {
      const items: MenuItem[] = [
        actionItem('new-request', () => newRequest(colId, path)),
        actionItem('new-folder', () => setNewFolderIn({ colId, path })),
        actionItem('run-collection', () => setRunnerScope({ colId, path }), { label: 'Run folder…' }),
        'sep',
        { label: 'Folder overview', icon: <FolderIcon size={14} />, onClick: () => inspectFolder(colId, path) },
        {
          label: 'Rename',
          icon: <PencilIcon size={14} />,
          onClick: () => setRenameTarget({ colId, path, nonce: ++renameSeq.current })
        },
        { label: 'Duplicate folder', icon: <CopyIcon size={14} />, onClick: () => duplicateFolder(colId, path) }
      ]
      setCtxMenu({ x, y, items, label: 'Folder actions' })
    },
    [inspectFolder, newRequest, duplicateFolder]
  )

  const envCollections = collections.filter((c) => c.environments.length > 0)

  // Past this body size, serializing and var-scanning on every keystroke lags;
  // fall back to a flag-based dirty check and skip the missing-var warning.
  const LARGE_BODY = 100_000
  const largeBody = (active?.body.content.length ?? 0) > LARGE_BODY
  /**
   * Per-request dirty check, cheap enough for every tab on every render: the
   * serialization is memoized on the request OBJECT reference (state updates
   * replace the object, so a stale cache entry is impossible), and very large
   * bodies use the edited flag instead of serializing at all.
   */
  const serializedCache = useRef(new Map<string, { req: TigerRequest; text: string }>())
  const isDirty = (id: string): boolean => {
    const req = requestsById[id]
    if (!req || !pathById[id]) return false
    if (req.body.content.length > LARGE_BODY) return editedIds.current.has(id)
    const hit = serializedCache.current.get(id)
    const text = hit && hit.req === req ? hit.text : serializeRequest(req)
    if (!hit || hit.req !== req) serializedCache.current.set(id, { req, text })
    return savedText.current[id] !== text
  }
  const dirty = !!(activeId && isDirty(activeId))

  // Tell the main process whether ANY loaded request has unsaved edits (open
  // tab or not), so closing the window warns before discarding them.
  const anyDirty = Object.keys(requestsById).some(isDirty)
  useEffect(() => {
    window.tiger?.setDirty?.(anyDirty)
  }, [anyDirty])

  const missingVars =
    activeEffective && !largeBody
      ? findMissingVars(sentSurface(activeEffective), envToVars(activeEnv))
      : []

  const paletteItems: SearchItem[] = collections.flatMap((c) =>
    c.entries.map((e) => ({ id: e.id, name: e.name, collection: c.name, method: e.method }))
  )

  // Tab labels come from collections state at render time, so renames in the
  // sidebar/editor stay in sync automatically.
  const entryById = new Map(collections.flatMap((c) => c.entries).map((e) => [e.id, e]))
  const tabItems: RequestTab[] = openTabs.flatMap((t): RequestTab[] => {
    const key = tabKey(t)
    if (t.kind === 'request') {
      const entry = entryById.get(t.id)
      return entry
        ? [{ key, kind: 'request' as const, label: entry.name, method: entry.method, dirty: isDirty(t.id) }]
        : []
    }
    const col = collections.find((c) => c.id === t.colId)
    if (!col) return []
    if (t.kind === 'collection') {
      return [{ key, kind: 'collection' as const, label: col.name }]
    }
    return [{ key, kind: 'folder' as const, label: t.path[t.path.length - 1] ?? 'folder' }]
  })

  // Persist the session (open roots, tabs, active tab) once restore settled,
  // so a half-booted state can never clobber the saved session.
  useEffect(() => {
    if (!sessionRestored.current) return
    writeStored(
      SESSION_KEYS.roots,
      JSON.stringify(collections.filter((c) => c.root).map((c) => c.root))
    )
    writeStored(SESSION_KEYS.tabs, JSON.stringify(openTabs))
    writeStored(SESSION_KEYS.active, activeTabKey ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collections, openTabs, activeTabKey])

  const activeTabItem = tabItems.find((t) => t.key === activeTabKey)
  const pageTitle =
    view === 'home'
      ? 'Home'
      : view === 'settings'
        ? 'Settings'
        : activeTabItem
          ? `${activeTabItem.dirty ? '* ' : ''}${activeTabItem.label}`
          : null
  // The window title names the active request/page, like any document app.
  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} - Tiger` : 'Tiger'
  }, [pageTitle])

  /** Skip link target: the URL field when a request is open, else the page. */
  const skipToMain = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    const url = document.querySelector<HTMLInputElement>('#main .url-input')
    if (url) url.focus()
    else document.getElementById('main')?.focus()
  }

  const activeSending = !!activeId && sendingIds.has(activeId)

  /** Collection (and folder) the "current" commands act on. */
  const currentTarget = (): { colId: string; path: string[] } | null => {
    if (activeCollection) return { colId: activeCollection.id, path: activeEntry?.folderPath ?? [] }
    if (inspect) return { colId: inspect.colId, path: inspect.type === 'folder' ? inspect.path : [] }
    return collections[0] ? { colId: collections[0].id, path: [] } : null
  }
  const needCollection = () => toast('Open or create a collection first')
  const needRequest = () => toast('Open a request first')
  /** Team sync for the current collection; `sync` also starts a sync once it is ready. */
  const openTeamSync = (sync = false) => {
    const t = currentTarget()
    const col = t ? collections.find((c) => c.id === t.colId) : undefined
    if (!col) return needCollection()
    if (!col.root) return toast('Team sync needs a collection saved in a folder. Open one from disk first.')
    setGitAutoSync(sync)
    setGitColId(col.id)
  }

  /**
   * Every registry action, wired to its handler. The native menu (menu.ts),
   * the command palette and the keyboard all dispatch through this one map, by
   * the ids in src/core/actions.ts.
   */
  const actionHandlers: Record<ActionId, () => void> = {
    'new-request': () => {
      const t = currentTarget()
      if (t) newRequest(t.colId, inspect?.type === 'folder' ? inspect.path : [])
      else needCollection()
    },
    'new-folder': () => {
      const t = currentTarget()
      if (t) setNewFolderIn({ colId: t.colId, path: inspect?.type === 'folder' ? inspect.path : [] })
      else needCollection()
    },
    'new-collection': newCollection,
    'new-environment': () => {
      if (!collections.length) return needCollection()
      setEnvStartNew(true)
      setModal('env')
    },
    'open-collection': openCollection,
    import: () => openIo('import'),
    export: () => openIo('export'),
    settings: () => setView('settings'),
    'close-tab': closeActiveTab,
    send,
    save,
    'duplicate-request': () => (activeId ? duplicateRequest(activeId) : needRequest()),
    'copy-curl': () => (activeId ? copyAsCurl(activeId) : needRequest()),
    'load-test': () => {
      if (!activeId) return needRequest()
      setView('workspace')
      const tab = openTabs.find((t) => t.kind === 'request' && t.id === activeId)
      if (tab) activateTab(tab)
      setShowSection({ id: 'perf', nonce: Date.now() })
    },
    'run-collection': () => {
      const t = currentTarget()
      if (t) setRunnerScope(inspect?.type === 'folder' ? { colId: t.colId, path: inspect.path } : { colId: t.colId })
      else needCollection()
    },
    'focus-url': () => {
      const url = document.querySelector<HTMLInputElement>('.url-input')
      url?.focus()
      url?.select()
    },
    'search-response': () => {},
    rename: () => (activeId ? setRenameTarget({ id: activeId, nonce: ++renameSeq.current }) : needRequest()),
    'command-palette': () => setPaletteOpen(true),
    environments: () => {
      setEnvStartNew(false)
      setModal('env')
    },
    history: openHistory,
    'toggle-sidebar': toggleSidebar,
    'theme-system': () => updateSettings({ theme: 'system' }),
    'theme-light': () => updateSettings({ theme: 'light' }),
    'theme-dark': () => updateSettings({ theme: 'dark' }),
    'zoom-in': () => {},
    'zoom-out': () => {},
    'zoom-reset': () => {},
    'next-tab': () => cycleTab(1),
    'previous-tab': () => cycleTab(-1),
    'jump-tab': () => {},
    'getting-started': () => setView('home'),
    shortcuts: () => setModal('shortcuts'),
    docs: () => openExternal(docsUrl('getting-started')),
    'report-issue': () => openExternal(`${REPO_URL}/issues`),
    'check-update': () => {
      if (!window.tiger?.checkUpdate) return toast('Updates are checked in the desktop app')
      window.tiger.checkUpdate().then((info) => {
        if (info) {
          setUpdate(info)
          setUpdateModalOpen(true)
        } else {
          toast("You're on the latest version")
        }
      })
    },
    about: () => setView('settings'),
    'join-team': cloneCollection,
    'team-sync': () => openTeamSync(),
    sync: () => openTeamSync(true),
    'save-version': () => openTeamSync(),
    'share-collection': () => openTeamSync()
  }
  menuActionsRef.current = actionHandlers

  const newMenuItems = (): MenuItem[] => [
    actionItem('new-request', actionHandlers['new-request']),
    actionItem('new-folder', actionHandlers['new-folder']),
    'sep',
    actionItem('new-collection', newCollection),
    actionItem('new-environment', actionHandlers['new-environment'])
  ]

  return (
    <div className="app">
      <a className="skip-link" href="#main" onClick={skipToMain}>
        {active && view === 'workspace' && !inspect ? 'Skip to request URL' : 'Skip to main content'}
      </a>
      <h1 className="sr-only">Tiger</h1>
      <header className="titlebar">
        <button
          type="button"
          className="brand"
          style={{ border: 'none', background: 'transparent', padding: 0, font: 'inherit' }}
          title={view === 'home' ? 'Back to workspace' : 'Home'}
          aria-label={view === 'home' ? 'Tiger, back to workspace' : 'Tiger home'}
          aria-current={view === 'home' ? 'page' : undefined}
          onClick={() => setView(view === 'home' ? 'workspace' : 'home')}
        >
          <span aria-hidden>
            <Logo size={22} rounded />
          </span>
          <span aria-hidden>Tiger</span>
        </button>
        <span className="spacer" />
        {update && (
          <button
            type="button"
            className="btn ghost update-chip"
            title={`Update to v${update.latest}`}
            onClick={() => setUpdateModalOpen(true)}
          >
            Update v{update.latest}
          </button>
        )}
        {sidebarHidden && (
          <button
            type="button"
            className="btn ghost"
            title={actionTitle('toggle-sidebar')}
            onClick={toggleSidebar}
          >
            <SidebarIcon size={15} /> <span className="btn-label">Show sidebar</span>
          </button>
        )}
        <div className="env-combo" title="Active environment">
          <select
            className="env-select"
            aria-label="Active environment"
            value={activeEnvKey ?? ''}
            onChange={(e) => changeEnv(e.target.value)}
          >
            <option value="">No environment</option>
            {envCollections.map((col) =>
              envCollections.length > 1 ? (
                <optgroup key={col.id} label={col.name}>
                  {col.environments.map((e) => (
                    <option key={e.name} value={`${col.id}${SEP}${e.name}`}>
                      {e.name}
                    </option>
                  ))}
                </optgroup>
              ) : (
                col.environments.map((e) => (
                  <option key={`${col.id}${SEP}${e.name}`} value={`${col.id}${SEP}${e.name}`}>
                    {e.name}
                  </option>
                ))
              )
            )}
          </select>
          <button
            type="button"
            className="env-edit"
            title="Manage environments"
            aria-label="Manage environments"
            onClick={actionHandlers.environments}
          >
            <GearIcon size={14} />
          </button>
        </div>
        <button type="button" className="btn ghost" title="History" onClick={openHistory}>
          <ClockIcon size={15} /> <span className="btn-label">History</span>
        </button>
        <button
          type="button"
          className={`btn ghost${view === 'settings' ? ' current' : ''}`}
          title="Settings"
          aria-current={view === 'settings' ? 'page' : undefined}
          onClick={() => setView(view === 'settings' ? 'workspace' : 'settings')}
        >
          <GearIcon size={15} /> <span className="btn-label">Settings</span>
        </button>
      </header>

      <div
        className="body"
        style={{
          gridTemplateColumns: sidebarHidden
            ? 'minmax(0, 1fr)'
            : `min(${sidebarW}px, 42vw) 6px minmax(0, 1fr)`,
          gap: 0
        }}
      >
        {!sidebarHidden && (
        <Sidebar
          collections={collections}
          activeId={activeId}
          syncStates={gitStates}
          onSelect={selectRequest}
          onOpenCollection={openCollection}
          onNewCollection={newCollection}
          onClone={cloneCollection}
          onImportExport={() => openIo('import')}
          onNewMenu={(x, y) => setCtxMenu({ x, y, items: newMenuItems(), label: 'New' })}
          renameTarget={renameTarget}
          onNewRequest={newRequest}
          onCloseCollection={requestCloseCollection}
          onEmptyMenu={(x, y) => setEmptyMenu({ x, y })}
          onDeleteRequest={setConfirmDeleteId}
          onDuplicateRequest={duplicateRequest}
          onGit={setGitColId}
          onRequestMenu={openRequestMenu}
          onCollectionMenu={openCollectionMenu}
          onFolderMenu={openFolderMenu}
          inspected={
            view === 'workspace' && inspect
              ? { colId: inspect.colId, path: inspect.type === 'folder' ? inspect.path : [] }
              : null
          }
          onInspectCollection={inspectCollection}
          onInspectFolder={inspectFolder}
          reveal={sidebarReveal}
          onRenameRequest={renameRequest}
          onRenameFolder={renameFolder}
          onDuplicateFolder={duplicateFolder}
          onMoveRequest={moveRequest}
        />
        )}

        {!sidebarHidden && (
        <Resizer
          direction="col"
          label="Resize sidebar"
          value={sidebarW}
          min={200}
          max={440}
          onResize={(w) => {
            setSidebarW(w)
            sidebarBase.current = w
            writeStored('tiger.sidebarW', String(w))
          }}
          onDrag={(delta) =>
            setSidebarW(Math.min(440, Math.max(200, sidebarBase.current + delta)))
          }
          onEnd={() =>
            setSidebarW((w) => {
              sidebarBase.current = w
              writeStored('tiger.sidebarW', String(w))
              return w
            })
          }
        />
        )}

        <main
          id="main"
          className="main-region"
          tabIndex={-1}
          aria-label={pageTitle ?? 'Workspace'}
          aria-busy={activeSending || undefined}
        >
        {view === 'home' ? (
          <WelcomeView
            version={appVersion}
            canCreateRequest={collections.length > 0}
            hasCollection={collections.length > 0}
            hasRequestOpen={!!active}
            hasSent={Object.keys(responses).length > 0}
            onOpenCollection={openCollection}
            onNewCollection={newCollection}
            onClone={cloneCollection}
            onImportExport={() => openIo('import')}
            onNewRequest={() => {
              if (collections[0]) newRequest(collections[0].id)
            }}
            onPalette={() => setPaletteOpen(true)}
            onHistory={openHistory}
            onEnvironments={() => setModal('env')}
            onSettings={() => setView('settings')}
            onGit={() => {
              const diskCol = collections.find((c) => c.root)
              if (diskCol) setGitColId(diskCol.id)
              else toast('Open a collection folder first to sync it with Git')
            }}
          />
        ) : view === 'settings' ? (
          <SettingsView settings={settings} onChange={updateSettings} />
        ) : (
          <div className="workspace">
            <RequestTabs
              tabs={tabItems}
              panelId="workspace-panel"
              activeKey={activeTabKey}
              onSelect={(key) => {
                const t = openTabs.find((x) => tabKey(x) === key)
                if (t) activateTab(t)
              }}
              onClose={closeTab}
              onTabMenu={openTabMenu}
              onReorder={reorderTabs}
            />
            <div
              className="workspace-panel"
              id="workspace-panel"
              role={activeTabItem ? 'tabpanel' : undefined}
              aria-label={activeTabItem ? tabAccessibleName(activeTabItem) : undefined}
            >
            {inspect ? (
              (() => {
                const col = collections.find((c) => c.id === inspect.colId)
                if (!col) return null
                if (inspect.type === 'folder') {
                  const key = inspect.path.join('/')
                  return (
                    <FolderView
                      collectionName={col.name}
                      root={col.root}
                      path={inspect.path}
                      entries={col.entries.filter((e) => e.folderPath.join('/') === key)}
                      auth={folderAuth(col.id, inspect.path)}
                      docs={folderDocs(col.id, inspect.path)}
                      onSelect={selectRequest}
                      onRun={() => setRunnerScope({ colId: col.id, path: inspect.path })}
                      onNewRequest={() => newRequest(col.id, inspect.path)}
                      onSaveAuth={(auth) => saveFolderAuth(col.id, inspect.path, auth)}
                      onSaveDocs={(docs) => saveFolderDocs(col.id, inspect.path, docs)}
                      onToast={toast}
                    />
                  )
                }
                const entryIds = new Set(col.entries.map((e) => e.id))
                return (
                  <CollectionView
                    collection={{
                      id: col.id,
                      name: col.name,
                      root: col.root,
                      requestCount: col.entries.length,
                      folderCount: new Set(
                        col.entries.map((e) => e.folderPath.join('/')).filter(Boolean)
                      ).size,
                      environments: col.environments.map((e) => e.name),
                      auth: col.auth,
                      docs: col.docs
                    }}
                    history={colHistory.filter((h) => h.requestId && entryIds.has(h.requestId))}
                    onToast={toast}
                    onSaveAuth={(auth) => saveCollectionAuth(col.id, auth)}
                    onSaveDocs={(docs) => saveCollectionDocs(col.id, docs)}
                    onRun={() => setRunnerScope({ colId: col.id })}
                    onNewRequest={() => newRequest(col.id)}
                    onImportExport={() => openIo('export')}
                    onClose={() => requestCloseCollection(col.id)}
                    onOpenGitDetails={() => setGitColId(col.id)}
                    onWorkingTreeChanged={() => invalidateCollectionCache(col.id)}
                  />
                )
              })()
            ) : (
              <div
                className="main"
                ref={mainRef}
                style={{
                  gridTemplateRows: editorH
                    ? `${editorH}px 6px minmax(120px, 1fr)`
                    : '1fr 6px 1fr',
                  gap: 0
                }}
              >
                {active ? (
                  <RequestEditor
                    key={activeId}
                    request={active}
                    sending={!!activeId && sendingIds.has(activeId)}
                    diskBacked={!!(activeId && pathById[activeId])}
                    dirty={dirty}
                    missingVars={missingVars}
                    onChange={updateActive}
                    onSend={send}
                    onCancel={cancelActive}
                    onSave={save}
                    getBuilt={() =>
                      activeEffective ? buildRequest(activeEffective, envToVars(activeEnv)) : null
                    }
                    showSection={showSection}
                    perf={{
                      collectionAuth: inheritedAuth,
                      env: activeEnv,
                      timeoutMs: settings.timeoutMs
                    }}
                  />
                ) : (
                  <section className="panel editor" aria-labelledby="empty-editor-title">
                    <div className="empty">
                      <span aria-hidden>
                        <Logo size={54} rounded />
                      </span>
                      <h2 id="empty-editor-title">No request open</h2>
                      <p>
                        {collections.length
                          ? 'Pick a request in the sidebar, or add one:'
                          : 'Open, create or import a collection from the sidebar first.'}
                      </p>
                      <div className="empty-actions">
                        {collections[0] && (
                          <button
                            type="button"
                            className="btn accent"
                            title={actionTitle('new-request')}
                            onClick={actionHandlers['new-request']}
                          >
                            <PlusIcon size={14} /> New request
                          </button>
                        )}
                        <button type="button" className="btn ghost" onClick={() => setView('home')}>
                          Getting started
                        </button>
                      </div>
                    </div>
                  </section>
                )}
                <Resizer
                  direction="row"
                  label="Resize request editor"
                  value={editorH ?? undefined}
                  min={140}
                  max={Math.max(140, (mainRef.current?.getBoundingClientRect().height ?? 800) - 160)}
                  measure={() =>
                    mainRef.current?.children.item(0)?.getBoundingClientRect().height ?? 300
                  }
                  onResize={(h) => {
                    setEditorH(h)
                    editorBase.current = h
                    writeStored('tiger.editorH', String(h))
                  }}
                  onDrag={(delta) => {
                    if (editorBase.current === null) {
                      editorBase.current =
                        mainRef.current?.children.item(0)?.getBoundingClientRect().height ?? 300
                    }
                    const max = (mainRef.current?.getBoundingClientRect().height ?? 800) - 160
                    setEditorH(Math.min(max, Math.max(140, editorBase.current + delta)))
                  }}
                  onEnd={() =>
                    setEditorH((h) => {
                      editorBase.current = h
                      if (h) writeStored('tiger.editorH', String(h))
                      return h
                    })
                  }
                />
                <ResponsePanel state={activeId ? responses[activeId] : undefined} />
              </div>
            )}
            </div>
          </div>
        )}
        </main>
      </div>

      {modal === 'io' && (
        <ImportExportModal
          focus={ioFocus}
          collectionName={activeCollection?.name ?? null}
          requestName={active?.name ?? null}
          environmentName={activeEnv?.name ?? null}
          onImport={loadImport}
          onImportCurl={importFromCurl}
          onExport={doExport}
          onClose={() => setModal('none')}
        />
      )}
      {modal === 'history' && (
        <HistoryModal
          entries={history}
          activeRequestId={activeId}
          activeRequestName={active?.name ?? null}
          collectionEntryIds={(activeCollection ?? collections[0])?.entries.map((e) => e.id) ?? []}
          collectionName={(activeCollection ?? collections[0])?.name ?? null}
          onClear={clearHistory}
          onClose={() => setModal('none')}
        />
      )}
      {modal === 'shortcuts' && <ShortcutsModal onClose={() => setModal('none')} />}
      {runnerScope &&
        (() => {
          const col = collections.find((c) => c.id === runnerScope.colId)
          const title = runnerScope.path?.length
            ? runnerScope.path[runnerScope.path.length - 1]
            : (col?.name ?? 'collection')
          return (
            <RunnerModal
              title={title}
              loadItems={loadRunnerItems}
              environment={activeEnv}
              timeoutMs={settings.timeoutMs}
              onClose={() => setRunnerScope(null)}
            />
          )
        })()}
      {modal === 'env' && (
        <EnvironmentsModal
          collections={collections.map((c) => ({
            id: c.id,
            name: c.name,
            root: c.root,
            environments: c.environments
          }))}
          initialColId={activeEnvKey ? activeEnvKey.slice(0, activeEnvKey.indexOf(SEP)) : undefined}
          initialEnvName={
            activeEnvKey ? activeEnvKey.slice(activeEnvKey.indexOf(SEP) + SEP.length) : undefined
          }
          activeEnvKey={activeEnvKey}
          envKeySep={SEP}
          onActivate={(key) => changeEnv(key)}
          onCollectionsChanged={setCollectionEnvironments}
          onActiveEnvMaybeChanged={(colId, name, data) => reloadActiveEnv(colId, name, data)}
          onToast={toast}
          startNew={envStartNew}
          onClose={() => {
            setEnvStartNew(false)
            setModal('none')
          }}
        />
      )}
      {newFolderIn && (
        <PromptModal
          title="New folder"
          label="Folder name"
          placeholder="Payments"
          confirmLabel="Create folder"
          onSubmit={(name) => {
            const target = newFolderIn
            setNewFolderIn(null)
            const clean = name.trim().replace(/[\\/]+/g, '-')
            if (!clean) return
            // A folder exists through its files: start it with a first request.
            newRequest(target.colId, [...target.path, clean])
            toast(`Folder ${clean} created with a first request`)
          }}
          onCancel={() => setNewFolderIn(null)}
        />
      )}
      {authColId &&
        (() => {
          const col = collections.find((c) => c.id === authColId)
          if (!col) return null
          return (
            <Modal
              title={`Auth for all requests · ${col.name}`}
              onClose={() => setAuthColId(null)}
              help={{ page: 'requests-auth', topic: 'Auth' }}
            >
              <p style={{ margin: '0 0 14px', color: 'var(--text-dim)', fontSize: 13.5 }}>
                Requests in this collection inherit this auth unless they set their own.
              </p>
              <AuthEditor
                noInherit
                auth={col.auth}
                onChange={(auth) => saveCollectionAuth(col.id, auth)}
              />
            </Modal>
          )
        })()}
      {gitColId &&
        (() => {
          const col = collections.find((c) => c.id === gitColId)
          if (!col) return null
          return (
            <GitModal
              collectionName={col.name}
              root={col.root ?? ''}
              onToast={toast}
              onWorkingTreeChanged={() => invalidateCollectionCache(col.id)}
              autoSync={gitAutoSync}
              onClose={() => {
                setGitColId(null)
                setGitAutoSync(false)
                refreshGitStates()
              }}
            />
          )
        })()}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.items}
          label={ctxMenu.label}
          onClose={() => setCtxMenu(null)}
        />
      )}
      {paletteOpen && (
        <PaletteModal
          items={paletteItems}
          onPick={(id) => {
            selectRequest(id)
            setPaletteOpen(false)
          }}
          onCommand={(id) => {
            setPaletteOpen(false)
            actionHandlers[id]()
          }}
          onClose={() => setPaletteOpen(false)}
        />
      )}
      {updateModalOpen && update && (
        <UpdateModal
          info={update}
          currentVersion={appVersion}
          onDownload={() => {
            window.tiger?.openExternal?.(update.url)
            setUpdateModalOpen(false)
          }}
          onClose={() => setUpdateModalOpen(false)}
        />
      )}
      {emptyMenu && (
        <ContextMenu
          x={emptyMenu.x}
          y={emptyMenu.y}
          items={[
            actionItem('new-collection', newCollection),
            actionItem('open-collection', openCollection),
            actionItem('join-team', cloneCollection),
            actionItem('import', () => openIo('import')),
            'sep',
            actionItem('environments', actionHandlers.environments)
          ]}
          label="Workspace actions"
          onClose={() => setEmptyMenu(null)}
        />
      )}
      {cloneOpen && (
        <JoinTeamModal onJoined={onJoinedTeam} onCancel={() => setCloneOpen(false)} />
      )}
      {newCollectionOpen && (
        <PromptModal
          title="New collection"
          label="Collection name"
          placeholder="Payments API"
          confirmLabel="Choose folder…"
          onSubmit={runNewCollection}
          onCancel={() => setNewCollectionOpen(false)}
        />
      )}
      {confirmCloseId && (
        <ConfirmModal
          title="Close collection"
          message={`Close "${collections.find((c) => c.id === confirmCloseId)?.name ?? 'this collection'}"? Your files stay on disk; this only removes it from the sidebar.`}
          confirmLabel="Close"
          onConfirm={() => {
            const id = confirmCloseId
            setConfirmCloseId(null)
            setInspect((cur) => (cur && cur.colId === id ? null : cur))
            closeCollection(id)
          }}
          onCancel={() => setConfirmCloseId(null)}
        />
      )}
      {confirmDeleteId && (
        <ConfirmModal
          title="Delete request"
          message={`Delete "${
            collections.flatMap((c) => c.entries).find((e) => e.id === confirmDeleteId)?.name ??
            'this request'
          }"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => deleteRequest(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      {downloadedUpdate && (
        <div className="update-ready" role="status">
          <CheckIcon size={15} />
          <span>
            Tiger {downloadedUpdate} is ready to install.
          </span>
          <button className="btn accent" onClick={() => window.tiger?.installUpdate?.()}>
            Restart &amp; update
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Dismiss"
            aria-label="Dismiss update notice"
            onClick={() => setDownloadedUpdate(null)}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}
      {/* Always mounted so screen readers pick up each new toast (polite);
          failures carry role=alert and are read immediately. */}
      <div className="toasts" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div
            className={`toast${t.error ? ' error' : ''}`}
            key={t.id}
            role={t.error ? 'alert' : undefined}
          >
            {t.error ? <XCircleIcon size={14} /> : <CheckIcon size={14} />}
            {t.text}
          </div>
        ))}
      </div>
    </div>
  )
}
