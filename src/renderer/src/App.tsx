import { useCallback, useEffect, useRef, useState } from 'react'
import { parseRequest, serializeRequest } from '@core/tigerFormat'
import { parseEnvironment, serializeEnvironment } from '@core/environment'
import { buildRequest, type BuiltRequest } from '@core/request'
import { envToVars } from '@core/interpolate'
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
import { Sidebar, type SidebarEntry } from './components/Sidebar'
import { RequestEditor } from './components/RequestEditor'
import { ResponsePanel } from './components/ResponsePanel'
import { SettingsView } from './components/SettingsView'
import { ImportExportModal, type ExportFormat } from './components/ImportExportModal'
import { CodeModal } from './components/CodeModal'
import { HistoryModal } from './components/HistoryModal'
import { EnvironmentModal } from './components/EnvironmentModal'
import { ConfirmModal } from './components/ConfirmModal'
import { CheckIcon, ClockIcon, GearIcon, PencilIcon } from './components/Icons'
import { runRequest } from './runRequest'
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

function resolveDark(theme: Settings['theme']): boolean {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
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
  const importCount = useRef(0)
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
    window.tiger?.getSettings().then(setSettings)
    window.tiger?.track?.(events.appOpened())
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
    window.tiger?.setSettings(patch).then(setSettings)
  }, [])

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
      const data = await runRequest(active, activeEnv, settings.timeoutMs)
      if (!deletedIds.current.has(id)) {
        setResponses((prev) => ({ ...prev, [id]: { loading: false, data } }))
      }
      window.tiger?.track?.(events.requestSent(active.method, data.status, data.ok))
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
      await window.tiger.writeFile(path, serializeRequest(active))
      toast('Saved')
    }
  }, [activeId, active, pathById, toast])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key.toLowerCase() === 's') {
        e.preventDefault()
        save()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        send()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, send])

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
        window.tiger?.track?.(events.collectionImported(result.source, result.requests.length))
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
        await window.tiger.writeFile(path, serializeRequest(request))
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

  const envCollections = collections.filter((c) => c.environments.length > 0)

  return (
    <div className="app">
      <div className="titlebar">
        <span className="brand">
          <Logo size={22} rounded />
          Tiger
        </span>
        <span className="spacer" />
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

      <div className="body">
        <Sidebar
          collections={collections}
          activeId={activeId}
          onSelect={selectRequest}
          onOpenCollection={openCollection}
          onImportExport={() => setModal('io')}
          onNewRequest={newRequest}
          onCloseCollection={closeCollection}
          onDeleteRequest={setConfirmDeleteId}
        />

        {view === 'settings' ? (
          <SettingsView settings={settings} onChange={updateSettings} />
        ) : (
          <div className="main">
            {active ? (
              <RequestEditor
                key={activeId}
                request={active}
                sending={!!activeId && sendingIds.has(activeId)}
                diskBacked={!!(activeId && pathById[activeId])}
                onChange={updateActive}
                onSend={send}
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
