import { useEffect, useMemo, useRef, useState } from 'react'
import { searchItems, type SearchItem } from '@core/search'
import { SearchIcon } from './Icons'

interface Props {
  items: SearchItem[]
  onPick: (id: string) => void
  onClose: () => void
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function PaletteModal({ items, onPick, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => searchItems(items, query, 8), [items, query])
  const clamped = Math.min(index, Math.max(0, results.length - 1))

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setIndex((i) => Math.min(i + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && results[clamped]) {
        onPick(results[clamped].id)
      } else if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
        ).filter((el) => el.offsetParent !== null)
        if (focusable.length === 0) {
          e.preventDefault()
          return
        }
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
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
      <div
        ref={dialogRef}
        className="modal palette"
        role="dialog"
        aria-label="Go to request"
        aria-modal="true"
      >
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
