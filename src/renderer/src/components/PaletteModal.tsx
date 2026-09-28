import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { searchItems, type SearchItem } from '@core/search'
import { ArrowDownIcon, ArrowUpIcon, SearchIcon } from './Icons'
import { useDialog } from './useDialog'
import './a11y.css'
import './Modal.css'
import './PaletteModal.css'

interface Props {
  items: SearchItem[]
  onPick: (id: string) => void
  onClose: () => void
}

/**
 * Command palette: a combobox (input) driving a listbox of requests.
 * Focus never leaves the input; aria-activedescendant points at the
 * highlighted option so screen readers follow the arrow keys.
 */
export function PaletteModal({ items, onPick, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const backdropRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const uid = useId()
  const listId = `${uid}-list`
  const optionId = (i: number) => `${uid}-opt-${i}`
  useDialog(backdropRef, dialogRef, onClose)

  const results = useMemo(() => searchItems(items, query, 8), [items, query])
  const clamped = Math.min(index, Math.max(0, results.length - 1))
  const active = results[clamped]

  // Arrow keys and Enter are handled at window level so they work even when
  // focus drifted (e.g. after a click on the backdrop edge).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setIndex((i) => (results.length ? (Math.min(i, results.length - 1) + 1) % results.length : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setIndex((i) =>
          results.length ? (Math.min(i, results.length - 1) - 1 + results.length) % results.length : 0
        )
      } else if (e.key === 'Home' && e.altKey) {
        e.preventDefault()
        setIndex(0)
      } else if (e.key === 'End' && e.altKey) {
        e.preventDefault()
        setIndex(Math.max(0, results.length - 1))
      } else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && results[clamped]) {
        e.preventDefault()
        onPick(results[clamped].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [results, clamped, onPick])

  // Keep the highlighted option in view.
  useEffect(() => {
    document.getElementById(optionId(clamped))?.scrollIntoView?.({ block: 'nearest' })
    // optionId derives from uid, which is stable for the component's life.
  }, [clamped, results])

  const countText = !query.trim()
    ? `${results.length} request${results.length === 1 ? '' : 's'}. Type to filter, arrows to move, Enter to open.`
    : results.length
      ? `${results.length} matching request${results.length === 1 ? '' : 's'}`
      : 'No matching requests'

  return (
    <div
      ref={backdropRef}
      className="modal-backdrop palette-backdrop"
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
        tabIndex={-1}
      >
        <div className="palette-input">
          <SearchIcon size={16} aria-hidden="true" />
          <input
            data-autofocus
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active ? optionId(clamped) : undefined}
            aria-label="Go to request"
            placeholder="Go to request…"
            value={query}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value)
              setIndex(0)
            }}
          />
          <kbd aria-hidden="true">esc</kbd>
        </div>
        <div
          id={listId}
          className="palette-list"
          role="listbox"
          aria-label="Requests"
        >
          {results.map((r, i) => (
            <div
              key={r.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === clamped}
              className={`palette-row ${i === clamped ? 'sel' : ''}`}
              onMouseEnter={() => setIndex(i)}
              // Keep focus in the input when clicking an option.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(r.id)}
            >
              <span className={`method-pill m-${r.method}`}>{r.method.toUpperCase()}</span>
              <span className="row-label" title={r.name}>
                {r.name}
              </span>
              <span className="palette-col" title={r.collection}>
                {r.collection}
              </span>
            </div>
          ))}
        </div>
        {results.length === 0 && (
          <div className="palette-empty">
            <b>No matching requests</b>
            <span>Try part of the name, the method (get, post) or the collection.</span>
          </div>
        )}
        <div className="palette-foot" aria-hidden="true">
          <span>
            <kbd>
              <ArrowUpIcon size={11} />
            </kbd>
            <kbd>
              <ArrowDownIcon size={11} />
            </kbd>{' '}
            move
          </span>
          <span>
            <kbd>Enter</kbd> open
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
        <div id={`${uid}-count`} className="tg-sr-only" role="status" aria-live="polite">
          {countText}
        </div>
      </div>
    </div>
  )
}
