import { useCallback, useEffect, useRef, useState } from 'react'
import { parseRequest, serializeRequest } from '@core/tigerFormat'
import { parseEnvironment, serializeEnvironment } from '@core/environment'
import { buildRequest, type BuiltRequest } from '@core/request'
import { envToVars, findMissingVars } from '@core/interpolate'
import type { SearchItem } from '@core/search'
import { exportPostman } from '@core/export'
import { toCurl } from '@core/codegen'
import { events } from '@core/analytics'
import type { FormattedResponse } from '@core/response'
import type { ImportedRequest } from '@core/import'
import type { HttpMethod, KeyValue, TigerEnvironment, TigerRequest } from '@core/types'
import type { Settings } from '../../main/settings'
import type { HistoryEntry } from '../../main/history'
import type { ImportKind } from '../../main/importers'
import { Logo } from './Logo'
import { Sidebar, type SidebarEntry, type SyncState } from './components/Sidebar'
import { GitModal } from './components/GitModal'
import { RequestEditor } from './components/RequestEditor'
import { ResponsePanel } from './components/ResponsePanel'
import { SettingsView } from './components/SettingsView'
import { ImportExportModal, type ExportFormat } from './components/ImportExportModal'
import { CodeModal } from './components/CodeModal'
import { HistoryModal } from './components/HistoryModal'
import { EnvironmentModal } from './components/EnvironmentModal'
import { ConfirmModal } from './components/ConfirmModal'
import { ContextMenu, type MenuItem } from './components/ContextMenu'
import { PaletteModal } from './components/PaletteModal'
import { Resizer } from './components/Resizer'
import { UpdateModal } from './components/UpdateModal'
import type { UpdateInfo } from '@core/version'
import {
  CheckIcon,
  ClockIcon,
  CodeIcon,
  CopyIcon,
  FileIcon,
  FolderOpenIcon,
  GearIcon,
  GitBranchIcon,
  PencilIcon,
  PlusIcon,
  SwapIcon,
  TrashIcon
} from './components/Icons'
import { cancelRequest, runRequest } from './runRequest'
import { initAnalytics, setAnalyticsEnabled, trackEvent } from './analytics'
import { sampleEnvironment, sampleRequests } from './sample'

interface ResponseState {
  loading: boolean
  error?: string
  data?: FormattedResponse
}

interface EnvRef {
  name: string
  path?: string
}

interface CollectionState {
  id: string
  name: string
  /** Absolute folder path when the collection lives on disk. */
  root?: string
  entries: SidebarEntry[]
  environments: EnvRef[]
}

type ModalKind = 'none' | 'io' | 'code' | 'history' | 'env'

interface Toast {
  id: number
  text: string
}

/**
 * Separator for composite ids (collection + request path, collection + env
 * name). U+001F never appears in file paths or names, so ids can't collide
 * even when one collection's folder is opened again as its own collection.
 */
const SEP = '\u001f'

const FALLBACK_SETTINGS: Settings = {
  theme: 'system',
  timeoutMs: 30000,
  fontSize: 13,
  followRedirects: true,
  maxRedirects: 5,
  sslVerify: true,
  proxyEnabled: false,
  proxyUrl: '',
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
  environments: [{ name: 'Demo' }]
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
  const [view, setView] = useState<'workspace' | 'settings'>('workspace')
  const [modal, setModal] = useState<ModalKind>('none')
  const [toasts, setToasts] = useState<Toast[]>([])

  const [collections, setCollections] = useState<CollectionState[]>([DEMO_COLLECTION])
  const [requestsById, setRequestsById] = useState<Record<string, TigerRequest>>(
    Object.fromEntries(sampleRequests.map((r) => [r.id, r.request]))
  )
  const [pathById, setPathById] = useState<Record<string, string>>({})
  const [activeId, setActiveId] = useState<string | null>(sampleRequests[0]?.id ?? null)

  const [activeEnvKey, setActiveEnvKey] = useState<string | null>(`demo${SEP}Demo`)
  const [activeEnv, setActiveEnv] = useState<TigerEnvironment | null>(sampleEnvironment)

  const [responses, setResponses] = useState<Record<string, ResponseState>>({})
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [codeBuilt, setCodeBuilt] = useState<BuiltRequest | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [appVersion, setAppVersion] = useState('dev')
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [updateModalOpen, setUpdateModalOpen] = useState(false)
  const [gitStates, setGitStates] = useState<Record<string, SyncState>>({})
  const [gitColId, setGitColId] = useState<string | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [sidebarW, setSidebarW] = useState(() => Number(readStored('tiger.sidebarW')) || 264)
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
  /** Monotonic token so a stale environment file read can't win a race. */
  const envSeq = useRef(0)

  const toast = useCallback((text: string) => {
    const id = ++toastSeq
    setToasts((prev) => [...prev, { id, text }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2600)
  }, [])

  useEffect(() => {
    window.tiger?.getSettings().then((s) => {
      setSettings(s)
      setAnalyticsEnabled(s.analyticsEnabled)
    })
    window.tiger?.version?.().then(setAppVersion)
    initAnalytics().then(() => trackEvent(events.appOpened()))
    window.tiger?.checkUpdate?.().then((info) => {
      if (info) {
        setUpdate(info)
        setUpdateModalOpen(true)
      }
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

  const refreshGitStates = useCallback(async () => {
    if (!window.tiger?.git) return
    const available = await window.tiger.git.check()
    if (!available.ok) return
    const diskCollections = collections.filter((c) => c.root)
    const states = await Promise.all(
      diskCollections.map(async (c) => {
        const s = await window.tiger!.git.status(c.root!)
        return [c.id, { isRepo: s.isRepo, dirtyCount: s.dirtyCount, ahead: s.ahead, behind: s.behind }] as const
      })
    )
    setGitStates(Object.fromEntries(states))
  }, [collections])

  // Sync indicators: refresh when collections change and on a slow heartbeat.
  useEffect(() => {
    refreshGitStates()
    const timer = setInterval(refreshGitStates, 60000)
    return () => clearInterval(timer)
  }, [refreshGitStates])

  const active = activeId ? requestsById[activeId] : undefined
  const activeCollection = activeId
    ? collections.find((c) => c.entries.some((e) => e.id === activeId))
    : undefined

  const loadRequest = useCallback(
    async (id: string): Promise<TigerRequest | undefined> => {
      if (requestsById[id]) return requestsById[id]
      if (pathById[id] && window.tiger) {
        try {
          const parsed = parseRequest(await window.tiger.readFile(pathById[id]))
          savedText.current[id] = serializeRequest(parsed)
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

  const selectRequest = useCallback(
    async (id: string) => {
      setActiveId(id)
      setView('workspace')
      await loadRequest(id)
    },
    [loadRequest]
  )

  const updateActive = useCallback(
    (request: TigerRequest) => {
      if (!activeId) return
      setRequestsById((prev) => ({ ...prev, [activeId]: request }))
      // Keep the sidebar entry's name and method in sync with the editor.
      setCollections((prev) =>
        prev.map((col) => ({
          ...col,
          entries: col.entries.map((e) =>
            e.id === activeId ? { ...e, name: request.name, method: request.method } : e
          )
        }))
      )
    },
    [activeId]
  )

  const send = useCallback(async () => {
    if (!activeId || !active) return
    const id = activeId
    if (sendingIds.has(id)) return
    setSendingIds((prev) => new Set(prev).add(id))
    setResponses((prev) => ({ ...prev, [id]: { loading: true } }))
    try {
      const data = await runRequest(active, activeEnv, settings.timeoutMs, id)
      if (!deletedIds.current.has(id)) {
        setResponses((prev) => ({ ...prev, [id]: { loading: false, data } }))
      }
      trackEvent(events.requestSent(active.method, data.status, data.ok))
    } catch (e) {
      if (!deletedIds.current.has(id)) {
        setResponses((prev) => ({ ...prev, [id]: { loading: false, error: (e as Error).message } }))
      }
    } finally {
      setSendingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }, [activeId, active, activeEnv, settings.timeoutMs, sendingIds])

  const save = useCallback(async () => {
    if (!activeId || !active) return
    const path = pathById[activeId]
    if (path && window.tiger) {
      const text = serializeRequest(active)
      await window.tiger.writeFile(path, text)
      savedText.current[activeId] = text
      toast('Saved')
    }
  }, [activeId, active, pathById, toast])

  const cancelActive = useCallback(() => {
    if (activeId) cancelRequest(activeId)
  }, [activeId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      // While the palette is open it owns the keyboard, except the toggle.
      if (paletteOpen && e.key.toLowerCase() !== 'k') return
      if (e.key.toLowerCase() === 's') {
        e.preventDefault()
        save()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        send()
      } else if (e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, send, paletteOpen])

  const openCollection = useCallback(async () => {
    const opened = await window.tiger?.openCollection()
    if (!opened) return
    const entries: SidebarEntry[] = opened.requests.map((r) => ({
      id: `${opened.root}${SEP}${r.path}`,
      name: r.name,
      method: r.method,
      folderPath: r.folder
    }))
    const next: CollectionState = {
      id: opened.root,
      name: opened.name,
      root: opened.root,
      entries,
      environments: opened.environments.map((e) => ({ name: e.name, path: e.path }))
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
    if (entries[0]) selectRequest(entries[0].id)
  }, [selectRequest])

  const loadImport = useCallback(
    (kind: ImportKind) => {
      window.tiger?.importCollection(kind).then((result) => {
        if (!result) return
        const colId = `import-${++importCount.current}`
        const entries: SidebarEntry[] = result.requests.map((r, i) => ({
          id: `${colId}${SEP}${i}`,
          name: r.request.name,
          method: r.request.method,
          folderPath: r.path
        }))
        setCollections((prev) => [
          ...prev,
          { id: colId, name: result.name, entries, environments: [] }
        ])
        setRequestsById((prev) => ({
          ...prev,
          ...Object.fromEntries(result.requests.map((r, i) => [`${colId}${SEP}${i}`, r.request]))
        }))
        setModal('none')
        if (entries[0]) setActiveId(entries[0].id)
        toast(`Imported ${entries.length} requests from ${result.name}`)
        trackEvent(events.collectionImported(result.source, result.requests.length))
      })
    },
    [toast]
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
          const json = JSON.stringify(exportPostman(col.name, imported), null, 2)
          const filename = `${col.name}.postman_collection.json`
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
    async (collectionId: string) => {
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
        const path = `${col.root}/new-request-${Date.now()}.tiger`
        id = `${col.id}${SEP}${path}`
        const text = serializeRequest(request)
        await window.tiger.writeFile(path, text)
        savedText.current[id] = text
        setPathById((prev) => ({ ...prev, [id]: path }))
      } else {
        id = `${col.id}${SEP}new-${Date.now()}`
      }
      setRequestsById((prev) => ({ ...prev, [id]: request }))
      setCollections((prev) =>
        prev.map((c) =>
          c.id === collectionId
            ? {
                ...c,
                entries: [
                  ...c.entries,
                  { id, name: request.name, method: 'get' as HttpMethod, folderPath: [] }
                ]
              }
            : c
        )
      )
      setActiveId(id)
      setView('workspace')
    },
    [collections]
  )

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
        setPathById((prev) => ({ ...prev, [id]: path }))
      } else {
        id = `${col.id}${SEP}dup-${Date.now()}`
      }
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
      setActiveId(id)
      setView('workspace')
      toast('Request duplicated')
    },
    [requestsById, loadRequest, collections, pathById, toast]
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
      if (activeId === entryId) setActiveId(null)
      toast('Request deleted')
    },
    [pathById, activeId, toast]
  )

  const closeCollection = useCallback(
    (collectionId: string) => {
      const col = collections.find((c) => c.id === collectionId)
      if (!col) return
      const ids = new Set(col.entries.map((e) => e.id))
      for (const id of ids) deletedIds.current.add(id)
      setCollections((prev) => prev.filter((c) => c.id !== collectionId))
      setRequestsById((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !ids.has(k))))
      setPathById((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !ids.has(k))))
      setResponses((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !ids.has(k))))
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
      if (colId === 'demo') return setActiveEnv(sampleEnvironment)
      const ref = collections.find((c) => c.id === colId)?.environments.find((e) => e.name === envName)
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

  const updateEnvVars = useCallback(
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

  const openCode = useCallback(() => {
    if (!active) return
    setCodeBuilt(buildRequest(active, envToVars(activeEnv)))
    setModal('code')
  }, [active, activeEnv])

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
          label: 'Duplicate',
          icon: <CopyIcon size={14} />,
          onClick: () => duplicateRequest(entryId)
        },
        { label: 'Copy as cURL', icon: <CodeIcon size={14} />, onClick: () => copyAsCurl(entryId) },
        'sep',
        {
          label: 'Delete…',
          icon: <TrashIcon size={14} />,
          danger: true,
          onClick: () => setConfirmDeleteId(entryId)
        }
      ]
      if (pathById[entryId] && window.tiger?.reveal) {
        items.splice(3, 0, {
          label: 'Reveal in file manager',
          icon: <FolderOpenIcon size={14} />,
          onClick: () => window.tiger!.reveal(pathById[entryId])
        })
      }
      setCtxMenu({ x, y, items })
    },
    [selectRequest, duplicateRequest, copyAsCurl, pathById]
  )

  const openCollectionMenu = useCallback(
    (colId: string, x: number, y: number) => {
      const col = collections.find((c) => c.id === colId)
      if (!col) return
      const items: MenuItem[] = [
        { label: 'New request', icon: <PlusIcon size={14} />, onClick: () => newRequest(colId) },
        {
          label: 'Import / Export…',
          icon: <SwapIcon size={14} />,
          onClick: () => setModal('io')
        }
      ]
      if (col.root) {
        items.push(
          {
            label: 'Git sync…',
            icon: <GitBranchIcon size={14} />,
            onClick: () => setGitColId(colId)
          },
          {
            label: 'Reveal in file manager',
            icon: <FolderOpenIcon size={14} />,
            onClick: () => window.tiger?.reveal?.(col.root!)
          }
        )
      }
      items.push('sep', {
        label: 'Close collection',
        icon: <TrashIcon size={14} />,
        danger: true,
        onClick: () => closeCollection(colId)
      })
      setCtxMenu({ x, y, items })
    },
    [collections, newRequest, closeCollection]
  )

  const envCollections = collections.filter((c) => c.environments.length > 0)

  const activeSerialized = active ? serializeRequest(active) : ''
  const dirty = !!(activeId && pathById[activeId] && savedText.current[activeId] !== activeSerialized)
  const missingVars = active ? findMissingVars(sentSurface(active), envToVars(activeEnv)) : []

  const paletteItems: SearchItem[] = collections.flatMap((c) =>
    c.entries.map((e) => ({ id: e.id, name: e.name, collection: c.name, method: e.method }))
  )

  return (
    <div className="app">
      <div className="titlebar">
        <span className="brand">
          <Logo size={22} rounded />
          Tiger
        </span>
        <span className="spacer" />
        {update && (
          <button
            className="btn ghost update-chip"
            title={`Update to v${update.latest}`}
            onClick={() => setUpdateModalOpen(true)}
          >
            Update v{update.latest}
          </button>
        )}
        <select
          className="env-select"
          value={activeEnvKey ?? ''}
          onChange={(e) => changeEnv(e.target.value)}
          title="Active environment"
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
        <button className="icon-btn" title="Manage environment" onClick={() => setModal('env')}>
          <PencilIcon />
        </button>
        <button className="btn ghost" title="History" onClick={openHistory}>
          <ClockIcon size={15} /> History
        </button>
        <button
          className="btn ghost"
          title="Settings"
          style={view === 'settings' ? { color: 'var(--accent)' } : undefined}
          onClick={() => setView(view === 'settings' ? 'workspace' : 'settings')}
        >
          <GearIcon size={15} /> Settings
        </button>
      </div>

      <div
        className="body"
        style={{ gridTemplateColumns: `${sidebarW}px 6px minmax(0, 1fr)`, gap: 0 }}
      >
        <Sidebar
          collections={collections}
          activeId={activeId}
          syncStates={gitStates}
          onSelect={selectRequest}
          onOpenCollection={openCollection}
          onImportExport={() => setModal('io')}
          onNewRequest={newRequest}
          onCloseCollection={closeCollection}
          onDeleteRequest={setConfirmDeleteId}
          onDuplicateRequest={duplicateRequest}
          onGit={setGitColId}
          onRequestMenu={openRequestMenu}
          onCollectionMenu={openCollectionMenu}
        />

        <Resizer
          direction="col"
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

        {view === 'settings' ? (
          <SettingsView settings={settings} onChange={updateSettings} />
        ) : (
          <div
            className="main"
            ref={mainRef}
            style={{
              gridTemplateRows: editorH ? `${editorH}px 6px minmax(120px, 1fr)` : '1fr 6px 1fr',
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
                onCode={openCode}
                onSave={save}
              />
            ) : (
              <section className="panel editor">
                <div className="empty">
                  <Logo size={54} rounded />
                  <h3>No request selected</h3>
                  <div>Choose one from the sidebar, open a folder, or import a collection.</div>
                </div>
              </section>
            )}
            <Resizer
              direction="row"
              onDrag={(delta) => {
                if (editorBase.current === null) {
                  editorBase.current =
                    mainRef.current?.firstElementChild?.getBoundingClientRect().height ?? 300
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

      {modal === 'io' && (
        <ImportExportModal
          collectionName={activeCollection?.name ?? null}
          requestName={active?.name ?? null}
          onImport={loadImport}
          onExport={doExport}
          onClose={() => setModal('none')}
        />
      )}
      {modal === 'code' && codeBuilt && <CodeModal built={codeBuilt} onClose={() => setModal('none')} />}
      {modal === 'history' && (
        <HistoryModal entries={history} onClear={clearHistory} onClose={() => setModal('none')} />
      )}
      {modal === 'env' && (
        <EnvironmentModal env={activeEnv} onChange={updateEnvVars} onClose={() => setModal('none')} />
      )}
      {gitColId &&
        (() => {
          const col = collections.find((c) => c.id === gitColId)
          if (!col) return null
          return (
            <GitModal
              collectionName={col.name}
              root={col.root ?? ''}
              onToast={toast}
              onClose={() => {
                setGitColId(null)
                refreshGitStates()
              }}
            />
          )
        })()}
      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />
      )}
      {paletteOpen && (
        <PaletteModal
          items={paletteItems}
          onPick={(id) => {
            selectRequest(id)
            setPaletteOpen(false)
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

      {toasts.length > 0 && (
        <div className="toasts">
          {toasts.map((t) => (
            <div className="toast" key={t.id}>
              <CheckIcon size={14} />
              {t.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
