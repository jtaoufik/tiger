import { useId, useLayoutEffect, useRef, useState } from 'react'
import { FILE_PREFIX } from '@core/multipart'
import type { KeyValue } from '@core/types'
import { useT } from '../i18n'
import { CloseIcon, FileIcon, FolderOpenIcon } from './Icons'
import './KeyValueEditor.css'
import './MultipartEditor.css'

interface Props {
  items: KeyValue[]
  onChange: (items: KeyValue[]) => void
}

/**
 * multipart/form-data rows: text fields plus file rows. A file row's value is
 * `@file:<path>`; the picker fills it, and it stays hand-editable.
 */
export function MultipartEditor({ items, onChange }: Props) {
  const t = useT()
  // Always show one trailing empty row to type into (KeyValueEditor pattern).
  const rows = [...items, { name: '', value: '', enabled: true }]
  const listRef = useRef<HTMLDivElement>(null)
  const hintId = useId()
  const [focusRow, setFocusRow] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (focusRow === null) return
    listRef.current
      ?.querySelector<HTMLInputElement>(`[data-kv-row="${focusRow}"] [data-kv-cell="name"]`)
      ?.focus()
    setFocusRow(null)
  }, [focusRow])

  const update = (index: number, patch: Partial<KeyValue>) => {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    onChange(next.filter((row, i) => i !== next.length - 1 || row.name || row.value))
  }

  const remove = (index: number) => {
    onChange(items.filter((_, i) => i !== index))
    setFocusRow(index)
  }

  const pickFile = async (index: number) => {
    const path = await window.tiger?.pickFile?.([{ name: t('request.multipart.allFiles'), extensions: ['*'] }])
    if (path) update(index, { value: `${FILE_PREFIX}${path}` })
  }

  return (
    <div className="multipart kv-editor" ref={listRef} role="group" aria-label={t('request.multipart.group')} aria-describedby={hintId}>
      {rows.map((row, i) => {
        const isFile = row.value.startsWith(FILE_PREFIX)
        const isBlank = i === rows.length - 1
        const rowName = isBlank
          ? t('request.multipart.newField')
          : t('request.multipart.field', { n: i + 1 })
        return (
          <div
            className={`kv ${row.enabled === false ? 'disabled' : ''} ${isBlank ? 'kv-blank' : ''}`}
            key={i}
            data-kv-row={i}
          >
            <input
              type="checkbox"
              checked={row.enabled !== false}
              disabled={isBlank}
              onChange={(e) => update(i, { enabled: e.target.checked })}
              aria-label={
                isBlank ? t('request.multipart.enableNew') : t('request.multipart.enable', { n: i + 1 })
              }
              title={row.enabled === false ? t('request.multipart.disabledTip') : t('request.kv.enabledTip')}
            />
            <input
              type="text"
              data-kv-cell="name"
              value={row.name}
              placeholder={t('request.multipart.fieldPlaceholder')}
              spellCheck={false}
              aria-label={t('request.kv.cellName', { row: rowName })}
              title={row.name.length > 32 ? row.name : undefined}
              onChange={(e) => update(i, { name: e.target.value })}
            />
            <div className={`mp-value ${isFile ? 'is-file' : ''}`}>
              {isFile && <FileIcon size={13} aria-hidden="true" />}
              <input
                type="text"
                value={row.value}
                placeholder={t('request.multipart.valuePlaceholder')}
                spellCheck={false}
                aria-label={
                  isFile
                    ? t('request.multipart.filePath', { row: rowName })
                    : t('request.kv.cellValue', { row: rowName })
                }
                title={row.value.length > 32 ? row.value : undefined}
                onChange={(e) => update(i, { value: e.target.value })}
              />
            </div>
            <button
              type="button"
              className="icon-btn mp-pick"
              title={t('request.multipart.pickTip')}
              aria-label={t('request.multipart.pick', { row: rowName.toLowerCase() })}
              onClick={() => pickFile(i)}
              disabled={!window.tiger}
            >
              <FolderOpenIcon size={14} />
            </button>
            {isBlank ? (
              <span />
            ) : (
              <button
                type="button"
                className="icon-btn danger kv-remove"
                title={
                  row.name
                    ? t('request.multipart.removeTipNamed', { name: row.name })
                    : t('request.multipart.removeTip', { n: i + 1 })
                }
                aria-label={
                  row.name
                    ? t('request.multipart.removeNamed', { n: i + 1, name: row.name })
                    : t('request.multipart.remove', { n: i + 1 })
                }
                onClick={() => remove(i)}
              >
                <CloseIcon size={14} />
              </button>
            )}
          </div>
        )
      })}
      <div className="mp-hint" id={hintId}>
        {t('request.multipart.hint', { prefix: FILE_PREFIX })}
      </div>
    </div>
  )
}
