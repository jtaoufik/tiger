import { useCallback, useEffect, useState } from 'react'
import { parseEnvironment, serializeEnvironment } from '@core/environment'
import type { KeyValue, TigerEnvironment } from '@core/types'
import { Modal } from './Modal'
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
  activeEnvKey: string | null
  envKeySep: string
  onActivate: (key: string) => void
  onCollectionsChanged: (
    colId: string,
    environments: Array<{ name: string; path?: string; data?: TigerEnvironment }>
  ) => void
  onToast: (text: string) => void
  onClose: () => void
}

/** Full environment management: create, rename, duplicate, delete, secrets. */
export function EnvironmentsModal({
  collections,
  initialColId,
  activeEnvKey,
  envKeySep,
  onActivate,
  onCollectionsChanged,
  onToast,
  onClose
}: Props) {
  const [colId, setColId] = useState(initialColId ?? collections[0]?.id ?? '')
  const col = collections.find((c) => c.id === colId)
  const [selected, setSelected] = useState<string | null>(col?.environments[0]?.name ?? null)
  const [env, setEnv] = useState<TigerEnvironment | null>(null)
  const [revealed, setRevealed] = useState<Set<number>>(new Set())

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
    },
    [col, onCollectionsChanged]
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

  return (
    <Modal title="Environments" onClose={onClose} width={680}>
      <div className="env-layout">
        <div className="env-side">
          <select
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

          <div className="env-list">
            {(col?.environments ?? []).map((e) => {
              const key = `${col!.id}${envKeySep}${e.name}`
              const isActive = activeEnvKey === key
              return (
                <div
                  key={e.name}
                  className={`env-row ${selected === e.name ? 'sel' : ''}`}
                  onClick={() => setSelected(e.name)}
                >
                  <span className="row-label">{e.name}</span>
                  <button
                    className={`icon-btn env-activate ${isActive ? 'on' : ''}`}
                    title={isActive ? 'Active environment' : 'Set as active'}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      if (!isActive) onActivate(key)
                    }}
                  >
                    <CheckIcon size={13} />
                  </button>
                  <span className="row-actions">
                    <button
                      className="icon-btn"
                      title="Duplicate environment"
                      onClick={async (ev) => {
                        ev.stopPropagation()
                        await loadEnv(e.name)
                        setSelected(e.name)
                        const ref = col!.environments.find((x) => x.name === e.name)
                        const data =
                          ref?.data ??
                          (ref?.path && window.tiger
                            ? parseEnvironment(await window.tiger.readFile(ref.path))
                            : { name: e.name, variables: [] })
                        createEnv(data)
                      }}
                    >
                      <CopyIcon size={12} />
                    </button>
                    <button
                      className="icon-btn danger"
                      title="Delete environment"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        deleteEnv(e.name)
                      }}
                    >
                      <TrashIcon size={12} />
                    </button>
                  </span>
                </div>
              )
            })}
            <button className="btn ghost env-new" title="Create environment" onClick={() => createEnv()}>
              <PlusIcon size={13} /> New environment
            </button>
          </div>
        </div>

        <div className="env-main">
          {!env ? (
            <div style={{ color: 'var(--text-dim)' }}>
              Select an environment, or create one to define {'{{variables}}'}.
            </div>
          ) : (
            <>
              <div className="field">
                <label>Name</label>
                <input
                  defaultValue={env.name}
                  key={env.name}
                  spellCheck={false}
                  title="Rename environment (press Enter)"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') renameEnv(env.name, (e.target as HTMLInputElement).value.trim())
                  }}
                  onBlur={(e) => renameEnv(env.name, e.target.value.trim())}
                />
              </div>
              <div className="section-label" style={{ marginTop: 4 }}>
                Variables
              </div>
              {rows.map((row, i) => {
                const isBlank = i === rows.length - 1
                const hidden = !!row.secret && !revealed.has(i)
                return (
                  <div className={`kv env-kv ${row.enabled === false ? 'disabled' : ''}`} key={i}>
                    <input
                      type="checkbox"
                      checked={row.enabled !== false}
                      disabled={isBlank}
                      title="Enable / disable"
                      onChange={(e) => updateRow(i, { enabled: e.target.checked })}
                    />
                    <input
                      type="text"
                      value={row.name}
                      placeholder="Variable"
                      spellCheck={false}
                      onChange={(e) => updateRow(i, { name: e.target.value })}
                    />
                    <input
                      type={hidden ? 'password' : 'text'}
                      value={row.value}
                      placeholder="Value"
                      spellCheck={false}
                      onChange={(e) => updateRow(i, { value: e.target.value })}
                    />
                    {!isBlank ? (
                      <span style={{ display: 'inline-flex', gap: 1 }}>
                        <button
                          className="icon-btn"
                          title={row.secret ? 'Secret (click to make plain)' : 'Mark as secret'}
                          style={row.secret ? { color: 'var(--accent)' } : undefined}
                          onClick={() => updateRow(i, { secret: !row.secret })}
                        >
                          {row.secret ? <EyeOffIcon size={13} /> : <EyeIcon size={13} />}
                        </button>
                        {row.secret && (
                          <button
                            className="icon-btn"
                            title={hidden ? 'Reveal value' : 'Hide value'}
                            onClick={() =>
                              setRevealed((prev) => {
                                const next = new Set(prev)
                                if (next.has(i)) next.delete(i)
                                else next.add(i)
                                return next
                              })
                            }
                          >
                            <EyeIcon size={13} />
                          </button>
                        )}
                        <button
                          className="icon-btn danger"
                          title="Remove variable"
                          onClick={() => setVars(env.variables.filter((_, idx) => idx !== i))}
                        >
                          <CloseIcon size={13} />
                        </button>
                      </span>
                    ) : (
                      <span />
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
