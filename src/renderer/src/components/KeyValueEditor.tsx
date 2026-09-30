import { useLayoutEffect, useRef, useState } from 'react'
import type { KeyValue } from '@core/types'
import type { MessageKey } from '@core/i18n'
import { useT } from '../i18n'
import { CloseIcon, PlusIcon } from './Icons'
import './a11y.css'
import './KeyValueEditor.css'

interface Props {
  items: KeyValue[]
  placeholder?: [string, string]
  /** Column headings when they should differ from the placeholders. */
  columns?: [string, string]
  /**
   * What a row is, for accessible names ("Header 3 name", "Add header"). Each
   * kind has complete sentences per language (request.kv.<kind>.*): a noun is
   * never spliced into a translated sentence, since gender and case differ.
   */
  kind?: KvKind
  onChange: (items: KeyValue[]) => void
}

export type KvKind = 'param' | 'header' | 'field' | 'capture' | 'variable' | 'item'

type KvText = 'list' | 'name' | 'value' | 'newName' | 'newValue' | 'enable' | 'enableNew' | 'remove' | 'removeNamed' | 'add'

function kvKey(kind: KvKind, text: KvText): MessageKey {
  return `request.kv.${kind}.${text}` as MessageKey
}

/** Values longer than this get a tooltip so truncated text stays readable. */
const TOOLTIP_AT = 32

export function KeyValueEditor({
  items,
  placeholder: placeholderProp,
  columns,
  kind = 'item',
  onChange
}: Props) {
  const t = useT()
  const placeholder = placeholderProp ?? [t('common.key'), t('common.value')]
  const rows = [...items, { name: '', value: '', enabled: true }]
  const k = (text: KvText) => kvKey(kind, text)
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

  return (
    <div className="kv-editor" ref={listRef} role="group" aria-label={t(k('list'))}>
      <div className="kv kv-head" aria-hidden="true">
        <span />
        <span>{(columns ?? placeholder)[0]}</span>
        <span>{(columns ?? placeholder)[1]}</span>
        <span />
      </div>
      {rows.map((row, i) => {
        const isBlank = i === rows.length - 1
        const n = i + 1
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
                isBlank ? t(k('enableNew')) : t(k('enable'), { n })
              }
              title={row.enabled === false ? t('request.kv.disabledTip') : t('request.kv.enabledTip')}
            />
            <input
              type="text"
              data-kv-cell="name"
              value={row.name}
              placeholder={placeholder[0]}
              spellCheck={false}
              aria-label={isBlank ? t(k('newName')) : t(k('name'), { n })}
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
              aria-label={isBlank ? t(k('newValue')) : t(k('value'), { n })}
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
                title={
                  row.name
                    ? t('request.kv.removeTipNamed', { name: row.name })
                    : t(k('remove'), { n })
                }
                aria-label={
                  row.name
                    ? t(k('removeNamed'), { n, name: row.name })
                    : t(k('remove'), { n })
                }
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
        <PlusIcon size={13} /> {t(k('add'))}
      </button>
    </div>
  )
}
