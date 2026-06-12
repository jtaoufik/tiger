import { FILE_PREFIX } from '@core/multipart'
import type { KeyValue } from '@core/types'
import { CloseIcon, FileIcon, FolderOpenIcon } from './Icons'
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

  const update = (index: number, patch: Partial<KeyValue>) => {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    onChange(next.filter((row, i) => i !== next.length - 1 || row.name || row.value))
  }

  const remove = (index: number) => {
    onChange(items.filter((_, i) => i !== index))
  }

  const pickFile = async (index: number) => {
    const path = await window.tiger?.pickFile?.([{ name: 'All files', extensions: ['*'] }])
    if (path) update(index, { value: `${FILE_PREFIX}${path}` })
  }

  return (
    <div className="multipart">
      {rows.map((row, i) => {
        const isFile = row.value.startsWith(FILE_PREFIX)
        const isBlank = i === rows.length - 1
        return (
          <div className={`kv ${row.enabled === false ? 'disabled' : ''}`} key={i}>
            <input
              type="checkbox"
              checked={row.enabled !== false}
              disabled={isBlank}
              onChange={(e) => update(i, { enabled: e.target.checked })}
              title="Enable / disable"
            />
            <input
              type="text"
              value={row.name}
              placeholder="Field"
              onChange={(e) => update(i, { name: e.target.value })}
            />
            <div className={`mp-value ${isFile ? 'is-file' : ''}`}>
              {isFile && <FileIcon size={13} />}
              <input
                type="text"
                value={row.value}
                placeholder="Text value, or pick a file"
                spellCheck={false}
                onChange={(e) => update(i, { value: e.target.value })}
              />
            </div>
            <button
              className="icon-btn"
              title="Choose a file for this field"
              onClick={() => pickFile(i)}
              disabled={!window.tiger}
            >
              <FolderOpenIcon size={14} />
            </button>
            {isBlank ? (
              <span />
            ) : (
              <button className="icon-btn danger" title="Remove" onClick={() => remove(i)}>
                <CloseIcon size={13} />
              </button>
            )}
          </div>
        )
      })}
      <div className="mp-hint">
        File rows upload the file at the given path (value format: {FILE_PREFIX}/path/to/file).
        Text rows are sent as ordinary form fields.
      </div>
    </div>
  )
}
