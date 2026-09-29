import { useLayoutEffect, useRef, useState } from 'react'
import type { KeyValue } from '@core/types'
import { CloseIcon, PlusIcon } from './Icons'
import './a11y.css'
import './KeyValueEditor.css'

interface Props {
  items: KeyValue[]
  placeholder?: [string, string]
  /** Column headings when they should differ from the placeholders. */
  columns?: [string, string]
  /** Singular noun for accessible labels ("Header" -> "Header 3 name"). Defaults to placeholder[0]. */
  noun?: string
  onChange: (items: KeyValue[]) => void
}

/** Values longer than this get a tooltip so truncated text stays readable. */
const TOOLTIP_AT = 32

export function KeyValueEditor({
  items,
  placeholder = ['Key', 'Value'],
  columns,
  noun,
  onChange
}: Props) {
  const rows = [...items, { name: '', value: '', enabled: true }]
  const label = noun ?? placeholder[0]
  const lower = label.toLowerCase()
  const listRef = useRef<HTMLDivElement>(null)
  // Row whose name field should take focus after the next render (add/remove).
  const [focusRow, setFocusRow] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (focusRow === null) return
    const el = listRef.current?.querySelector<HTMLInputElement>(
      `[data-kv-row="${focusRow}"] [data-kv-cell="name"]`
    )
    el?.focus()
    setFocusRow(null)
  }, [focusRow])

  function update(index: number, patch: Partial<KeyValue>) {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    onChange(next.filter((row, i) => i !== next.length - 1 || row.name || row.value))
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index))
    // The row below slides into this slot (the blank row at worst), so focus stays put.
    setFocusRow(index)
  }

  const rowName = (i: number) => (i === rows.length - 1 ? `New ${lower}` : `${label} ${i + 1}`)

  return (
    <div className="kv-editor" ref={listRef} role="group" aria-label={`${label} list`}>
      <div className="kv kv-head" aria-hidden="true">
        <span />
        <span>{(columns ?? placeholder)[0]}</span>
        <span>{(columns ?? placeholder)[1]}</span>
        <span />
      </div>
      {rows.map((row, i) => {
        const isBlank = i === rows.length - 1
        const name = rowName(i)
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
              aria-label={isBlank ? `Enable new ${lower}` : `Enable ${lower} ${i + 1}`}
              title={row.enabled === false ? 'Disabled: not sent. Click to enable' : 'Enabled: click to disable'}
            />
            <input
              type="text"
              data-kv-cell="name"
              value={row.name}
              placeholder={placeholder[0]}
              spellCheck={false}
              aria-label={`${name} name`}
              title={row.name.length > TOOLTIP_AT ? row.name : undefined}
              onChange={(e) => update(i, { name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  ;(e.currentTarget.nextElementSibling as HTMLInputElement | null)?.focus()
                }
              }}
            />
            <input
              type="text"
              data-kv-cell="value"
              value={row.value}
              placeholder={placeholder[1]}
              spellCheck={false}
              aria-label={`${name} value`}
              title={row.value.length > TOOLTIP_AT ? row.value : undefined}
              onChange={(e) => update(i, { value: e.target.value })}
              onKeyDown={(e) => {
                // Enter jumps to the next row's key, like a spreadsheet.
                if (e.key === 'Enter') {
                  e.preventDefault()
                  setFocusRow(Math.min(i + 1, rows.length - 1))
                }
              }}
            />
            {isBlank ? (
              <span />
            ) : (
              <button
                type="button"
                className="icon-btn danger kv-remove"
                title={`Remove ${row.name ? `"${row.name}"` : `${lower} ${i + 1}`}`}
                aria-label={`Remove ${lower} ${i + 1}${row.name ? ` (${row.name})` : ''}`}
                onClick={() => remove(i)}
              >
                <CloseIcon size={14} />
              </button>
            )}
          </div>
        )
      })}
      <button
        type="button"
        className="btn ghost kv-add"
        onClick={() => setFocusRow(rows.length - 1)}
      >
        <PlusIcon size={13} /> Add {lower}
      </button>
    </div>
  )
}
