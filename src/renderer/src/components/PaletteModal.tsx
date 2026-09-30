import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { searchItems, type SearchItem } from '@core/search'
import {
  actionDescription,
  actionLabel,
  matchActions,
  shortcutKeys,
  type ActionDef,
  type ActionId
} from '@core/actions'
import { useT } from '../i18n'
import { actionIcon } from '../actions'
import { MOD } from '../platform'
import { ArrowDownIcon, ArrowUpIcon, SearchIcon } from './Icons'
import { useDialog } from './useDialog'
import './a11y.css'
import './Modal.css'
import './PaletteModal.css'

interface Props {
  items: SearchItem[]
  onPick: (id: string) => void
  /** Run a command from the action registry. Omit to search requests only. */
  onCommand?: (id: ActionId) => void
  onClose: () => void
}

type Row = { kind: 'request'; item: SearchItem } | { kind: 'command'; action: ActionDef }

/**
 * Command palette: one combobox that finds requests and runs commands. The
 * commands come from the action registry, so they carry the same names as the
 * menus. Start the query with ">" to list commands only.
 *
 * Focus never leaves the input; aria-activedescendant points at the
 * highlighted option so screen readers follow the arrow keys.
 */
export function PaletteModal({ items, onPick, onCommand, onClose }: Props) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const backdropRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const uid = useId()
  const listId = `${uid}-list`
  const optionId = (i: number) => `${uid}-opt-${i}`
  useDialog(backdropRef, dialogRef, onClose)

  const commandsOnly = query.trimStart().startsWith('>')
  const text = commandsOnly ? query.trimStart().slice(1) : query
  const requests = useMemo(
    () => (commandsOnly ? [] : searchItems(items, text, 8)),
    [items, text, commandsOnly]
  )
  const commands = useMemo(
    () => (onCommand ? matchActions(text, t, commandsOnly ? 12 : 6) : []),
    [text, commandsOnly, onCommand, t]
  )
  const rows: Row[] = useMemo(
    () => [
      ...requests.map((item) => ({ kind: 'request' as const, item })),
      ...commands.map((action) => ({ kind: 'command' as const, action }))
    ],
    [requests, commands]
  )
  const clamped = Math.min(index, Math.max(0, rows.length - 1))
  const active = rows[clamped]

  const choose = (row: Row) => {
    if (row.kind === 'request') onPick(row.item.id)
    else onCommand?.(row.action.id as ActionId)
  }

  // Arrow keys and Enter are handled at window level so they work even when
  // focus drifted (e.g. after a click on the backdrop edge).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setIndex((i) => (rows.length ? (Math.min(i, rows.length - 1) + 1) % rows.length : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setIndex((i) => (rows.length ? (Math.min(i, rows.length - 1) - 1 + rows.length) % rows.length : 0))
      } else if (e.key === 'Home' && e.altKey) {
        e.preventDefault()
        setIndex(0)
      } else if (e.key === 'End' && e.altKey) {
        e.preventDefault()
        setIndex(Math.max(0, rows.length - 1))
      } else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && rows[clamped]) {
        e.preventDefault()
        choose(rows[clamped])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Keep the highlighted option in view.
  useEffect(() => {
    document.getElementById(optionId(clamped))?.scrollIntoView?.({ block: 'nearest' })
    // optionId derives from uid, which is stable for the component's life.
  }, [clamped, rows])

  const countText = !text.trim()
    ? onCommand
      ? t('modals.palette.countBoth', {
          requests: t('modals.palette.requestsCount', { count: requests.length }),
          commands: t('modals.palette.commandsCount', { count: commands.length })
        })
      : t('modals.palette.countRequests', {
          requests: t('modals.palette.requestsCount', { count: requests.length })
        })
    : rows.length
      ? onCommand
        ? t('modals.palette.matchBoth', {
            requests: t('modals.palette.matchingRequests', { count: requests.length }),
            commands: t('modals.palette.matchingCommands', { count: commands.length })
          })
        : t('modals.palette.matchingRequests', { count: requests.length })
      : onCommand
        ? t('modals.palette.noneBoth')
        : t('modals.palette.noneRequests')

  const name = onCommand ? t('modals.palette.commandPalette') : t('modals.palette.goToRequest')

  const renderRow = (row: Row, i: number) => {
    const common = {
      id: optionId(i),
      role: 'option' as const,
      'aria-selected': i === clamped,
      className: `palette-row ${row.kind === 'command' ? 'palette-cmd ' : ''}${i === clamped ? 'sel' : ''}`,
      onMouseEnter: () => setIndex(i),
      // Keep focus in the input when clicking an option.
      onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
      onClick: () => choose(row)
    }
    if (row.kind === 'request') {
      const r = row.item
      return (
        <div key={`r-${r.id}`} {...common}>
          <span className={`method-pill m-${r.method}`}>{r.method.toUpperCase()}</span>
          <span className="row-label" title={r.name}>
            {r.name}
          </span>
          <span className="palette-col" title={r.collection}>
            {r.collection}
          </span>
        </div>
      )
    }
    const a = row.action
    const keys = shortcutKeys(a.id as ActionId, MOD)
    return (
      <div key={`c-${a.id}`} {...common} aria-describedby={`${uid}-d-${a.id}`}>
        <span className="palette-cmd-icon" aria-hidden="true">
          {actionIcon(a.id as ActionId, 15)}
        </span>
        <span className="palette-cmd-text">
          <span className="row-label">{actionLabel(a.id as ActionId, t)}</span>
          <span className="palette-cmd-desc" id={`${uid}-d-${a.id}`}>
            {actionDescription(a.id as ActionId, t)}
          </span>
        </span>
        {keys.length > 0 && (
          <span className="palette-keys" aria-hidden="true">
            {keys.map((k) => (
              <kbd key={k}>{k}</kbd>
            ))}
          </span>
        )}
      </div>
    )
  }

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
        aria-label={name}
        aria-modal="true"
        tabIndex={-1}
      >
        <div className="palette-input">
          <SearchIcon size={16} aria-hidden="true" />
          <input
            data-autofocus
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active ? optionId(clamped) : undefined}
            aria-label={name}
            placeholder={
              onCommand ? t('modals.palette.placeholderAll') : t('modals.palette.placeholderRequests')
            }
            value={query}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value)
              setIndex(0)
            }}
          />
          {/* i18n-ignore: key cap */}
          <kbd aria-hidden="true">esc</kbd>
        </div>
        <div id={listId} className="palette-list" role="listbox" aria-label={name}>
          {requests.length > 0 && (
            <div role="group" aria-label={t('modals.palette.groupRequests')}>
              {commands.length > 0 && (
                <div className="palette-group" aria-hidden="true">
                  {t('modals.palette.groupRequests')}
                </div>
              )}
              {rows.slice(0, requests.length).map((row, i) => renderRow(row, i))}
            </div>
          )}
          {commands.length > 0 && (
            <div role="group" aria-label={t('modals.palette.groupCommands')}>
              <div className="palette-group" aria-hidden="true">
                {t('modals.palette.groupCommands')}
              </div>
              {rows.slice(requests.length).map((row, i) => renderRow(row, requests.length + i))}
            </div>
          )}
        </div>
        {rows.length === 0 && (
          <div className="palette-empty">
            <b>
              {onCommand ? t('modals.palette.emptyTitleAll') : t('modals.palette.emptyTitleRequests')}
            </b>
            <span>
              {onCommand ? t('modals.palette.emptyHintAll') : t('modals.palette.emptyHintRequests')}
            </span>
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
            {t('modals.palette.footMove')}
          </span>
          <span>
            <kbd>Enter</kbd> {t('modals.palette.footOpen')}
          </span>
          {onCommand && (
            <span>
              {/* i18n-ignore: key cap */}
              <kbd>&gt;</kbd> {t('modals.palette.footCommands')}
            </span>
          )}
          <span>
            {/* i18n-ignore: key cap */}
            <kbd>esc</kbd> {t('modals.palette.footClose')}
          </span>
        </div>
        <div id={`${uid}-count`} className="tg-sr-only" role="status" aria-live="polite">
          {countText}
        </div>
      </div>
    </div>
  )
}
