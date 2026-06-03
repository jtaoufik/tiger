import type { KeyValue } from '@core/types'
import { CloseIcon } from './Icons'

interface Props {
  items: KeyValue[]
  placeholder?: [string, string]
  onChange: (items: KeyValue[]) => void
}

export function KeyValueEditor({ items, placeholder = ['Key', 'Value'], onChange }: Props) {
  const rows = [...items, { name: '', value: '', enabled: true }]

  function update(index: number, patch: Partial<KeyValue>) {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    onChange(next.filter((row, i) => i !== next.length - 1 || row.name || row.value))
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  return (
    <div>
      {rows.map((row, i) => {
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
              placeholder={placeholder[0]}
              onChange={(e) => update(i, { name: e.target.value })}
            />
            <input
              type="text"
              value={row.value}
              placeholder={placeholder[1]}
              onChange={(e) => update(i, { value: e.target.value })}
            />
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
    </div>
  )
}
