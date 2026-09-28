import { useCallback, useEffect, useId, useState } from 'react'
import { parseEnvironment, serializeEnvironment } from '@core/environment'
import type { KeyValue, TigerEnvironment } from '@core/types'
import { Modal } from './Modal'
import './KeyValueEditor.css'
import './EnvironmentsModal.css'
import { CheckIcon, CloseIcon, CopyIcon, EyeIcon, EyeOffIcon, PlusIcon, TrashIcon } from './Icons'

export interface EnvCollectionRef {
  id: string
  name: string
  root?: string
  environments: Array<{ name: string; path?: string; data?: TigerEnvironment }>
}

interface Props {
  collections: EnvCollectionRef[]
  initialColId?: string
  initialEnvName?: string
  activeEnvKey: string | null
  envKeySep: string
  onActivate: (key: string) => void
  onCollectionsChanged: (
    colId: string,
    environments: Array<{ name: string; path?: string; data?: TigerEnvironment }>
  ) => void
  /**
   * Fired whenever this modal writes the environment that is currently active
   * (same colId + name as activeEnvKey), so App can refresh its activeEnv copy.
   * Without this, editing the active disk-backed env never reaches the next
   * send, which keeps interpolating the old variable values.
   */
  onActiveEnvMaybeChanged?: (colId: string, name: string, data: TigerEnvironment) => void
  onToast: (text: string) => void
  onClose: () => void
}

/** Full environment management: create, rename, duplicate, delete, secrets. */
export function EnvironmentsModal({
  collections,
  initialColId,
  initialEnvName,
  activeEnvKey,
  envKeySep,
  onActivate,
  onCollectionsChanged,
  onActiveEnvMaybeChanged,
  onToast,
  onClose
}: Props) {
  const [colId, setColId] = useState(initialColId ?? collections[0]?.id ?? '')
  const col = collections.find((c) => c.id === colId)
  const [selected, setSelected] = useState<string | null>(initialEnvName ?? col?.environments[0]?.name ?? null)
  const [env, setEnv] = useState<TigerEnvironment | null>(null)
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const idBase = useId()

  const loadEnv = useCallback(
    async (name: string | null) => {
      setRevealed(new Set())
      if (!col || !name) return setEnv(null)
      const ref = col.environments.find((e) => e.name === name)
      if (!ref) return setEnv(null)
      if (ref.data) return setEnv(ref.data)
      if (ref.path && window.tiger) {
        try {
          return setEnv(parseEnvironment(await window.tiger.readFile(ref.path)))
        } catch {
          return setEnv({ name, variables: [] })
        }
      }
      setEnv({ name, variables: [] })
    },
    [col]
  )

  useEffect(() => {
    loadEnv(selected)
  }, [selected, loadEnv])

  const persist = useCallback(
    async (next: TigerEnvironment, refName: string) => {
      if (!col) return
      setEnv(next)
      const ref = col.environments.find((e) => e.name === refName)
      if (ref?.path && window.tiger) {
        await window.tiger.writeFile(ref.path, serializeEnvironment(next))
      } else {
        onCollectionsChanged(
          col.id,
          col.environments.map((e) => (e.name === refName ? { ...e, data: next } : e))
        )
      }
      // If we just rewrote the active environment, App must pick up the new
      // values or the next send will still interpolate the stale ones.
      if (activeEnvKey === `${col.id}${envKeySep}${refName}`) {
        onActiveEnvMaybeChanged?.(col.id, refName, next)
      }
    },
    [col, activeEnvKey, envKeySep, onActiveEnvMaybeChanged, onCollectionsChanged]
  )

  const envFilePath = (name: string) =>
    col?.root ? `${col.root}/environments/${name.replace(/[^\w.-]+/g, '-').toLowerCase()}.tiger` : undefined

  const createEnv = useCallback(
    async (from?: TigerEnvironment) => {
      if (!col) return
      let name = from ? `${from.name} copy` : 'new-environment'
      let n = 2
      while (col.environments.some((e) => e.name === name)) name = `${from ? from.name : 'new-environment'} ${n++}`
      const data: TigerEnvironment = { name, variables: from ? [...from.variables] : [] }
      const path = envFilePath(name)
      if (path && window.tiger) {
        await window.tiger.writeFile(path, serializeEnvironment(data))
        onCollectionsChanged(col.id, [...col.environments, { name, path }])
      } else {
        onCollectionsChanged(col.id, [...col.environments, { name, data }])
      }
      setSelected(name)
      onToast(from ? 'Environment duplicated' : 'Environment created')
    },
    [col, onCollectionsChanged, onToast]
  )

  const renameEnv = useCallback(
    async (oldName: string, newName: string) => {
      if (!col || !newName.trim() || oldName === newName) return
      if (col.environments.some((e) => e.name === newName)) return onToast('That name is taken')
      const ref = col.environments.find((e) => e.name === oldName)
      if (!ref) return
      const current = env && env.name === oldName ? env : null
      const data: TigerEnvironment = { name: newName, variables: current?.variables ?? [] }
      if (ref.path && window.tiger) {
        const newPath = envFilePath(newName)!
        const text = current
          ? serializeEnvironment(data)
          : serializeEnvironment({ ...parseEnvironment(await window.tiger.readFile(ref.path)), name: newName })
        await window.tiger.writeFile(newPath, text)
        await window.tiger.deleteFile(ref.path)
        onCollectionsChanged(
          col.id,
          col.environments.map((e) => (e.name === oldName ? { name: newName, path: newPath } : e))
        )
      } else {
        onCollectionsChanged(
          col.id,
          col.environments.map((e) => (e.name === oldName ? { name: newName, data } : e))
        )
      }
      if (activeEnvKey === `${col.id}${envKeySep}${oldName}`) {
        onActivate(`${col.id}${envKeySep}${newName}`)
      }
      setSelected(newName)
    },
    [col, env, activeEnvKey, envKeySep, onActivate, onCollectionsChanged, onToast]
  )

  const deleteEnv = useCallback(
    async (name: string) => {
      if (!col) return
      const ref = col.environments.find((e) => e.name === name)
      if (ref?.path && window.tiger) {
        try {
          await window.tiger.deleteFile(ref.path)
        } catch {
          /* already gone */
        }
      }
      onCollectionsChanged(col.id, col.environments.filter((e) => e.name !== name))
      if (selected === name) setSelected(null)
      if (activeEnvKey === `${col.id}${envKeySep}${name}`) onActivate('')
      onToast('Environment deleted')
    },
    [col, selected, activeEnvKey, envKeySep, onActivate, onCollectionsChanged, onToast]
  )

  const setVars = useCallback(
    (variables: KeyValue[]) => {
      if (!env || !selected) return
      persist({ ...env, variables }, selected)
    },
    [env, selected, persist]
  )

  const rows = env ? [...env.variables, { name: '', value: '', enabled: true }] : []

  const updateRow = (index: number, patch: Partial<KeyValue>) => {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    setVars(next.filter((row, i) => i !== next.length - 1 || row.name || row.value))
  }

  const duplicate = async (name: string) => {
    if (!col) return
    await loadEnv(name)
    setSelected(name)
    const ref = col.environments.find((x) => x.name === name)
    const data =
      ref?.data ??
      (ref?.path && window.tiger
        ? parseEnvironment(await window.tiger.readFile(ref.path))
        : { name, variables: [] })
    createEnv(data)
  }

  const envs = col?.environments ?? []

  return (
    <Modal
      title="Environments"
      onClose={onClose}
      width={700}
      description="Named sets of {{variables}}. The checked environment is the one requests use."
    >
      <div className="env-layout envs-modal">
        <div className="env-side">
          <label className="tg-sr-only" htmlFor={`${idBase}-col`}>
            Collection
          </label>
          <select
            id={`${idBase}-col`}
            className="env-select"
            style={{ width: '100%' }}
            title="Collection"
            value={colId}
            onChange={(e) => {
              setColId(e.target.value)
              const next = collections.find((c) => c.id === e.target.value)
              setSelected(next?.environments[0]?.name ?? null)
            }}
          >
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <ul className="env-list" aria-label={`Environments in ${col?.name ?? 'collection'}`}>
            {envs.map((e) => {
              const key = `${col!.id}${envKeySep}${e.name}`
              const isActive = activeEnvKey === key
              const isSel = selected === e.name
              const confirming = pendingDelete === e.name
              return (
                <li key={e.name} className={`env-row ${isSel ? 'sel' : ''}`}>
                  <button
                    type="button"
                    className={`icon-btn env-activate ${isActive ? 'on' : ''}`}
                    title={isActive ? `${e.name} is the active environment` : `Use ${e.name} for requests`}
                    aria-label={isActive ? `${e.name} is active` : `Set ${e.name} as active`}
                    aria-pressed={isActive}
                    onClick={() => {
                      if (!isActive) onActivate(key)
                    }}
                  >
                    <CheckIcon size={14} />
                  </button>
                  <button
                    type="button"
                    className="env-pick row-label"
                    aria-current={isSel ? 'true' : undefined}
                    title={e.name}
                    onClick={() => setSelected(e.name)}
                  >
                    {e.name}
                    {isActive && <span className="env-active-tag">active</span>}
                  </button>
                  <span className="row-actions">
                    {confirming ? (
                      <>
                        <button
                          type="button"
                          className="btn danger env-confirm"
                          onClick={() => {
                            setPendingDelete(null)
                            deleteEnv(e.name)
                          }}
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          className="btn ghost env-confirm"
                          data-autofocus
                          onClick={() => setPendingDelete(null)}
                        >
                          Keep
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="icon-btn"
                          title="Duplicate environment"
                          aria-label={`Duplicate ${e.name}`}
                          onClick={() => duplicate(e.name)}
                        >
                          <CopyIcon size={13} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn danger"
                          title="Delete environment"
                          aria-label={`Delete ${e.name}`}
                          onClick={() => setPendingDelete(e.name)}
                        >
                          <TrashIcon size={13} />
                        </button>
                      </>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
          <button type="button" className="btn ghost env-new" onClick={() => createEnv()}>
            <PlusIcon size={13} /> New environment
          </button>
        </div>

        <div className="env-main">
          {!env ? (
            <div className="modal-empty">
              <h3>{envs.length ? 'Pick an environment' : 'No environments yet'}</h3>
              <p>
                {envs.length
                  ? 'Select one on the left to edit its variables.'
                  : 'Create one to define values like {{baseUrl}} or {{token}} once and reuse them in every request.'}
              </p>
              {!envs.length && (
                <button type="button" className="btn accent" onClick={() => createEnv()}>
                  <PlusIcon size={14} /> Create environment
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor={`${idBase}-name`}>Name</label>
                <input
                  id={`${idBase}-name`}
                  defaultValue={env.name}
                  key={env.name}
                  spellCheck={false}
                  aria-describedby={`${idBase}-name-hint`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') renameEnv(env.name, (e.target as HTMLInputElement).value.trim())
                  }}
                  onBlur={(e) => renameEnv(env.name, e.target.value.trim())}
                />
                <div id={`${idBase}-name-hint`} className="env-hint">
                  Press Enter or leave the field to rename.
                </div>
              </div>
              <h3 className="section-label" style={{ marginTop: 4 }}>
                Variables
              </h3>
              <div className="kv-editor" role="group" aria-label={`Variables of ${env.name}`}>
                {rows.map((row, i) => {
                  const isBlank = i === rows.length - 1
                  const hidden = !!row.secret && !revealed.has(i)
                  const rowName = isBlank ? 'New variable' : `Variable ${i + 1}`
                  return (
                    <div
                      className={`kv env-kv ${row.enabled === false ? 'disabled' : ''} ${isBlank ? 'kv-blank' : ''}`}
                      key={i}
                    >
                      <input
                        type="checkbox"
                        checked={row.enabled !== false}
                        disabled={isBlank}
                        title={row.enabled === false ? 'Disabled: click to enable' : 'Enabled: click to disable'}
                        aria-label={isBlank ? 'Enable new variable' : `Enable variable ${i + 1}`}
                        onChange={(e) => updateRow(i, { enabled: e.target.checked })}
                      />
                      <input
                        type="text"
                        value={row.name}
                        placeholder="baseUrl"
                        spellCheck={false}
                        aria-label={`${rowName} name`}
                        title={row.name.length > 32 ? row.name : undefined}
                        onChange={(e) => updateRow(i, { name: e.target.value })}
                      />
                      <input
                        type={hidden ? 'password' : 'text'}
                        value={row.value}
                        placeholder="https://api.example.com"
                        spellCheck={false}
                        aria-label={`${rowName} value${row.secret ? ' (secret)' : ''}`}
                        title={!hidden && row.value.length > 32 ? row.value : undefined}
                        onChange={(e) => updateRow(i, { value: e.target.value })}
                      />
                      {!isBlank ? (
                        <span className="env-kv-actions">
                          <button
                            type="button"
                            className={`icon-btn ${row.secret ? 'on' : ''}`}
                            title={row.secret ? 'Secret (click to make plain)' : 'Mark as secret'}
                            aria-label={`Secret variable ${i + 1}`}
                            aria-pressed={!!row.secret}
                            onClick={() => updateRow(i, { secret: !row.secret })}
                          >
                            {row.secret ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                          </button>
                          {row.secret && (
                            <button
                              type="button"
                              className="icon-btn"
                              title={hidden ? 'Reveal value' : 'Hide value'}
                              aria-label={`${hidden ? 'Reveal' : 'Hide'} variable ${i + 1} value`}
                              onClick={() =>
                                setRevealed((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(i)) next.delete(i)
                                  else next.add(i)
                                  return next
                                })
                              }
                            >
                              <EyeIcon size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="icon-btn danger"
                            title="Remove variable"
                            aria-label={`Remove variable ${i + 1}${row.name ? ` (${row.name})` : ''}`}
                            onClick={() => setVars(env.variables.filter((_, idx) => idx !== i))}
                          >
                            <CloseIcon size={14} />
                          </button>
                        </span>
                      ) : (
                        <span />
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
