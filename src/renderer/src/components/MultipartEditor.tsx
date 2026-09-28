import { useId, useLayoutEffect, useRef, useState } from 'react'
import { FILE_PREFIX } from '@core/multipart'
import type { KeyValue } from '@core/types'
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
    const path = await window.tiger?.pickFile?.([{ name: 'All files', extensions: ['*'] }])
    if (path) update(index, { value: `${FILE_PREFIX}${path}` })
  }

  return (
    <div className="multipart kv-editor" ref={listRef} role="group" aria-label="Form fields" aria-describedby={hintId}>
      {rows.map((row, i) => {
        const isFile = row.value.startsWith(FILE_PREFIX)
        const isBlank = i === rows.length - 1
        const rowName = isBlank ? 'New field' : `Field ${i + 1}`
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
              aria-label={isBlank ? 'Enable new field' : `Enable field ${i + 1}`}
              title={row.enabled === false ? 'Disabled: click to enable' : 'Enabled: click to disable'}
            />
            <input
              type="text"
              data-kv-cell="name"
              value={row.name}
              placeholder="Field"
              spellCheck={false}
              aria-label={`${rowName} name`}
              title={row.name.length > 32 ? row.name : undefined}
              onChange={(e) => update(i, { name: e.target.value })}
            />
            <div className={`mp-value ${isFile ? 'is-file' : ''}`}>
              {isFile && <FileIcon size={13} aria-hidden="true" />}
              <input
                type="text"
                value={row.value}
                placeholder="Text value, or pick a file"
                spellCheck={false}
                aria-label={`${rowName} ${isFile ? 'file path' : 'value'}`}
                title={row.value.length > 32 ? row.value : undefined}
                onChange={(e) => update(i, { value: e.target.value })}
              />
            </div>
            <button
              type="button"
              className="icon-btn mp-pick"
              title="Choose a file for this field"
              aria-label={`Choose a file for ${rowName.toLowerCase()}`}
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
                title={`Remove ${row.name ? `"${row.name}"` : `field ${i + 1}`}`}
                aria-label={`Remove field ${i + 1}${row.name ? ` (${row.name})` : ''}`}
                onClick={() => remove(i)}
              >
                <CloseIcon size={14} />
              </button>
            )}
          </div>
        )
      })}
      <div className="mp-hint" id={hintId}>
        File rows upload the file at the given path (value format: {FILE_PREFIX}/path/to/file).
        Text rows are sent as ordinary form fields.
      </div>
    </div>
  )
}
