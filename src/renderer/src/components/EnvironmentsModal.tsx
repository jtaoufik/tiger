import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { parseEnvironment, serializeEnvironment } from '@core/environment'
import { safeFileName, uniqueName } from '@core/collectionFiles'
import type { KeyValue, TigerEnvironment } from '@core/types'
import { Modal } from './Modal'
import { useT } from '../i18n'
import './KeyValueEditor.css'
import './EnvironmentsModal.css'
import { CheckIcon, CloseIcon, CopyIcon, EyeIcon, LockIcon, LockOpenIcon, PlusIcon, TrashIcon } from './Icons'

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
  /** `error` styles the toast as a failure (and announces it assertively). */
  onToast: (text: string, opts?: { error?: boolean }) => void
  onClose: () => void
  /** Create a new environment as soon as the modal opens (menu "New environment"). */
  startNew?: boolean
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
  onClose,
  startNew = false
}: Props) {
  const t = useT()
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

  /**
   * A file for an environment called `name` that no other environment of the
   * collection uses, compared without case like Windows and macOS do. The old
   * slug turned "Dev" and "dev", or any two names in Chinese, Hindi or Arabic,
   * into the same file, so one environment overwrote the other.
   */
  const envFilePath = (name: string, ownPath?: string) => {
    if (!col?.root) return undefined
    const taken = new Set(
      col.environments
        .filter((e) => e.path && e.path !== ownPath)
        .map((e) => e.path!.slice(e.path!.lastIndexOf('/') + 1).replace(/\.tiger$/i, '').toLowerCase())
    )
    return `${col.root}/environments/${uniqueName(safeFileName(name, 'environment'), taken)}.tiger`
  }

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
      onToast(t(from ? 'modals.environments.toastDuplicated' : 'modals.environments.toastCreated'))
    },
    [col, onCollectionsChanged, onToast, t]
  )

  // "New environment" from a menu opens the modal with one already created.
  const started = useRef(false)
  useEffect(() => {
    if (startNew && !started.current && col) {
      started.current = true
      void createEnv()
    }
  }, [startNew, col, createEnv])

  const renameEnv = useCallback(
    async (oldName: string, newName: string) => {
      if (!col || !newName.trim() || oldName === newName) return
      if (col.environments.some((e) => e.name === newName)) return onToast(t('modals.environments.toastNameTaken'), { error: true })
      const ref = col.environments.find((e) => e.name === oldName)
      if (!ref) return
      const current = env && env.name === oldName ? env : null
      const data: TigerEnvironment = { name: newName, variables: current?.variables ?? [] }
      if (ref.path && window.tiger) {
        const text = current
          ? serializeEnvironment(data)
          : serializeEnvironment({ ...parseEnvironment(await window.tiger.readFile(ref.path)), name: newName })
        // Renaming "staging" to "Staging" is the same file on Windows and
        // macOS: rewrite it in place, never write it and then delete it.
        let newPath = envFilePath(newName, ref.path)!
        if (newPath.toLowerCase() === ref.path.toLowerCase()) newPath = ref.path
        await window.tiger.writeFile(newPath, text)
        if (newPath !== ref.path) await window.tiger.deleteFile(ref.path)
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
    [col, env, activeEnvKey, envKeySep, onActivate, onCollectionsChanged, onToast, t]
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
      onToast(t('modals.environments.toastDeleted'))
    },
    [col, selected, activeEnvKey, envKeySep, onActivate, onCollectionsChanged, onToast, t]
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
      title={t('modals.environments.title')}
      onClose={onClose}
      width={700}
      description={t('modals.environments.description', { vars: '{{variables}}' })}
      help={{ page: 'environments', topic: t('modals.environments.title') }}
    >
      <div className="env-layout envs-modal">
        <div className="env-side">
          <label className="tg-sr-only" htmlFor={`${idBase}-col`}>
            {t('modals.environments.collection')}
          </label>
          <select
            id={`${idBase}-col`}
            className="env-select"
            style={{ width: '100%' }}
            title={t('modals.environments.collection')}
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

          <ul className="env-list" aria-label={t('modals.environments.listLabel', {
              name: col?.name ?? t('modals.environments.listFallback')
            })}>
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
                    title={
                      isActive
                        ? t('modals.environments.activeTitle', { name: e.name })
                        : t('modals.environments.useTitle', { name: e.name })
                    }
                    aria-label={
                      isActive
                        ? t('modals.environments.activeLabel', { name: e.name })
                        : t('modals.environments.setActiveLabel', { name: e.name })
                    }
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
                    {isActive && <span className="env-active-tag">{t('modals.environments.activeTag')}</span>}
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
                          {t('common.delete')}
                        </button>
                        <button
                          type="button"
                          className="btn ghost env-confirm"
                          data-autofocus
                          onClick={() => setPendingDelete(null)}
                        >
                          {t('modals.environments.keep')}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="icon-btn"
                          title={t('modals.environments.duplicateTitle')}
                          aria-label={t('modals.environments.duplicateLabel', { name: e.name })}
                          onClick={() => duplicate(e.name)}
                        >
                          <CopyIcon size={13} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn danger"
                          title={t('modals.environments.deleteTitle')}
                          aria-label={t('modals.environments.deleteLabel', { name: e.name })}
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
            <PlusIcon size={13} /> {t('modals.environments.new')}
          </button>
        </div>

        <div className="env-main">
          {!env ? (
            <div className="modal-empty">
              <h3>{envs.length ? t('modals.environments.pick') : t('modals.environments.none')}</h3>
              <p>
                {envs.length
                  ? t('modals.environments.pickHint')
                  : t('modals.environments.noneHint', { base: '{{baseUrl}}', token: '{{token}}' })}
              </p>
              {!envs.length && (
                <button type="button" className="btn accent" onClick={() => createEnv()}>
                  <PlusIcon size={14} /> {t('modals.environments.new')}
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor={`${idBase}-name`}>{t('common.name')}</label>
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
                  {t('modals.environments.renameHint')}
                </div>
              </div>
              <h3 className="section-label" style={{ marginTop: 4 }}>
                {t('modals.environments.variables')}
              </h3>
              <div className="kv-editor" role="group" aria-label={t('modals.environments.variablesOf', { name: env.name })}>
                {rows.map((row, i) => {
                  const isBlank = i === rows.length - 1
                  const hidden = !!row.secret && !revealed.has(i)
                  return (
                    <div
                      className={`kv env-kv ${row.enabled === false ? 'disabled' : ''} ${isBlank ? 'kv-blank' : ''}`}
                      key={i}
                    >
                      <input
                        type="checkbox"
                        checked={row.enabled !== false}
                        disabled={isBlank}
                        title={
                          row.enabled === false
                            ? t('modals.environments.disabledTitle')
                            : t('modals.environments.enabledTitle')
                        }
                        aria-label={
                          isBlank
                            ? t('modals.environments.enableNew')
                            : t('modals.environments.enableN', { n: i + 1 })
                        }
                        onChange={(e) => updateRow(i, { enabled: e.target.checked })}
                      />
                      <input
                        type="text"
                        value={row.name}
                        // i18n-ignore: example variable name
                        placeholder="baseUrl"
                        spellCheck={false}
                        aria-label={
                          isBlank
                            ? t('modals.environments.nameNew')
                            : t('modals.environments.nameN', { n: i + 1 })
                        }
                        title={row.name.length > 32 ? row.name : undefined}
                        onChange={(e) => updateRow(i, { name: e.target.value })}
                      />
                      <input
                        type={hidden ? 'password' : 'text'}
                        value={row.value}
                        placeholder="https://api.example.com"
                        spellCheck={false}
                        aria-label={
                          isBlank
                            ? t('modals.environments.valueNew')
                            : row.secret
                              ? t('modals.environments.valueSecretN', { n: i + 1 })
                              : t('modals.environments.valueN', { n: i + 1 })
                        }
                        title={!hidden && row.value.length > 32 ? row.value : undefined}
                        onChange={(e) => updateRow(i, { value: e.target.value })}
                      />
                      {!isBlank ? (
                        <span className="env-kv-actions">
                          <button
                            type="button"
                            className={`icon-btn ${row.secret ? 'on' : ''}`}
                            title={
                              row.secret
                                ? t('modals.environments.secretOnTitle')
                                : t('modals.environments.secretOffTitle')
                            }
                            aria-label={t('modals.environments.secretLabel', { n: i + 1 })}
                            aria-pressed={!!row.secret}
                            onClick={() => updateRow(i, { secret: !row.secret })}
                          >
                            {row.secret ? <LockIcon size={14} /> : <LockOpenIcon size={14} />}
                          </button>
                          {row.secret && (
                            <button
                              type="button"
                              className="icon-btn"
                              title={hidden ? t('modals.environments.revealTitle') : t('modals.environments.hideTitle')}
                              aria-label={t(
                                hidden ? 'modals.environments.revealLabel' : 'modals.environments.hideLabel',
                                { n: i + 1 }
                              )}
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
                            title={t('modals.environments.removeTitle')}
                            aria-label={
                              row.name
                                ? t('modals.environments.removeLabelNamed', { n: i + 1, name: row.name })
                                : t('modals.environments.removeLabel', { n: i + 1 })
                            }
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
