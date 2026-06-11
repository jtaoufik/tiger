import { useEffect, useMemo, useRef, useState } from 'react'
import { searchItems, type SearchItem } from '@core/search'
import { SearchIcon } from './Icons'

interface Props {
  items: SearchItem[]
  onPick: (id: string) => void
  onClose: () => void
}

export function PaletteModal({ items, onPick, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => searchItems(items, query, 8), [items, query])
  const clamped = Math.min(index, Math.max(0, results.length - 1))

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setIndex((i) => Math.min(i + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && results[clamped]) {
        onPick(results[clamped].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [results, clamped, onPick, onClose])

  return (
    <div
      className="modal-backdrop"
      style={{ alignItems: 'flex-start', paddingTop: '14vh' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal palette" role="dialog" aria-label="Go to request">
        <div className="palette-input">
          <SearchIcon size={15} />
          <input
            ref={inputRef}
            placeholder="Go to request…"
            value={query}
            spellCheck={false}
            onChange={(e) => {
              setQuery(e.target.value)
              setIndex(0)
            }}
          />
          <kbd>esc</kbd>
        </div>
        <div className="palette-list">
          {results.length === 0 && <div className="palette-empty">No matching requests.</div>}
          {results.map((r, i) => (
            <div
              key={r.id}
              className={`palette-row ${i === clamped ? 'sel' : ''}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => onPick(r.id)}
            >
              <span className={`method-pill m-${r.method}`}>{r.method.toUpperCase()}</span>
              <span className="row-label">{r.name}</span>
              <span className="palette-col">{r.collection}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
