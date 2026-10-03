/**
 * Workspace tabs (Postman-style). A tab is a request, a collection page or a
 * folder page. Labels and methods come from the App's collections state at
 * render time, so renames stay in sync. Middle-click closes a tab.
 *
 * Keyboard (WAI-ARIA tabs, manual activation): one tab stop; Left/Right/Home/
 * End move focus, Enter/Space activate, Delete closes, Shift+F10 or the
 * ContextMenu key opens the tab menu.
 */
import { useEffect, useId, useRef, useState } from 'react'
import type { HttpMethod } from '@core/types'
import { BoxIcon, CloseIcon, FolderIcon } from './Icons'
import './RequestTabs.css'
import { MOD } from '../platform'
import { isContextMenuKey, isRtlDocument, menuAnchor, rovingIndex } from '../a11y'
import { t as tr, useT } from '../i18n'
import type { MessageKey, Vars } from '@core/i18n'

export interface RequestTab {
  key: string
  kind: 'request' | 'collection' | 'folder'
  label: string
  method?: HttpMethod
  /** Unsaved changes (request tabs only). */
  dirty?: boolean
}

interface RequestTabsProps {
  tabs: RequestTab[]
  activeKey: string | null
  onSelect: (key: string) => void
  onClose: (key: string) => void
  onTabMenu: (key: string, x: number, y: number) => void
  onReorder: (sourceKey: string, targetKey: string, side: 'before' | 'after') => void
  /** id of the element showing the active tab's content (role=tabpanel). */
  panelId?: string
}

/** Accessible name: "GET Create user, unsaved changes" / "Folder Orders". */
export function tabAccessibleName(
  tab: RequestTab,
  translate: (key: MessageKey, vars?: Vars) => string = tr
): string {
  const name = translate(
    tab.kind === 'request'
      ? 'sidebar.tabs.requestName'
      : tab.kind === 'folder'
        ? 'sidebar.tabs.folderName'
        : 'sidebar.tabs.collectionName',
    { method: tab.method?.toUpperCase() ?? '', label: tab.label }
  ).trim()
  return tab.dirty ? translate('sidebar.tabs.nameUnsaved', { name }) : name
}

export function RequestTabs({
  tabs,
  activeKey,
  onSelect,
  onClose,
  onTabMenu,
  onReorder,
  panelId
}: RequestTabsProps) {
  const t = useT()
  const stripRef = useRef<HTMLDivElement>(null)
  const [drop, setDrop] = useState<{ key: string; side: 'before' | 'after' } | null>(null)
  const idBase = useId()
  /** Keyboard focus may sit on a tab other than the active one (manual activation). */
  const [focusKey, setFocusKey] = useState<string | null>(null)
  /** After a keyboard close, focus lands on the tab at this index. */
  const refocusIndex = useRef<number | null>(null)
  const pendingFocus = useRef<string | null>(null)

  const stopKey =
    (focusKey && tabs.some((x) => x.key === focusKey) && focusKey) ||
    (activeKey && tabs.some((x) => x.key === activeKey) && activeKey) ||
    tabs[0]?.key ||
    null

  const tabEls = () =>
    Array.from(stripRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])

  // Keep the active tab visible when activating or opening at the end.
  useEffect(() => {
    const strip = stripRef.current
    const el = strip?.querySelector('.request-tab.active') as HTMLElement | null
    if (!strip || !el) return
    // Scroll the strip itself rather than calling el.scrollIntoView(): Chromium
    // moves its sequential focus starting point to a scrolled-into-view element,
    // so on launch the first Tab skipped the skip link and header and landed in
    // the request editor.
    const s = strip.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    if (r.left < s.left) strip.scrollLeft -= s.left - r.left
    else if (r.right > s.right) strip.scrollLeft += r.right - s.right
  }, [activeKey, tabs.length])

  useEffect(() => {
    if (refocusIndex.current !== null) {
      const els = tabEls()
      const el = els[Math.min(refocusIndex.current, els.length - 1)]
      refocusIndex.current = null
      if (el) {
        setFocusKey(el.dataset.tabKey ?? null)
        el.focus()
      }
      return
    }
    const key = pendingFocus.current
    if (!key) return
    pendingFocus.current = null
    tabEls()
      .find((el) => el.dataset.tabKey === key)
      ?.focus()
  })

  const focusTab = (key: string | undefined) => {
    if (!key) return
    pendingFocus.current = key
    setFocusKey(key)
  }

  const closeFromKeyboard = (key: string, index: number) => {
    refocusIndex.current = index
    onClose(key)
  }

  return (
    <div
      className="request-tabs"
      role="tablist"
      aria-label={t('sidebar.tabs.label')}
      aria-orientation="horizontal"
      ref={stripRef}
    >
      {tabs.map((tab, index) => {
        const active = tab.key === activeKey
        const name = tabAccessibleName(tab, t)
        return (
          <div
            key={tab.key}
            id={`${idBase}-tab-${index}`}
            role="tab"
            data-tab-key={tab.key}
            aria-selected={active}
            aria-controls={active ? panelId : undefined}
            aria-label={name}
            tabIndex={tab.key === stopKey ? 0 : -1}
            className={`request-tab${active ? ' active' : ''}${
              drop?.key === tab.key ? ` drop-${drop.side}` : ''
            }`}
            title={tab.dirty ? t('sidebar.tabs.titleUnsaved', { label: tab.label }) : tab.label}
            draggable
            onFocus={(e) => {
              if (e.target === e.currentTarget) setFocusKey(tab.key)
            }}
            onDragStart={(e) => {
              e.dataTransfer.setData('application/x-tiger-tab', tab.key)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes('application/x-tiger-tab')) return
              e.preventDefault()
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              // "Before" is the reading start: the right half in Arabic.
              const startHalf = (e.clientX < rect.left + rect.width / 2) !== isRtlDocument()
              const side = startHalf ? 'before' : 'after'
              setDrop({ key: tab.key, side })
            }}
            onDragLeave={() => setDrop((d) => (d?.key === tab.key ? null : d))}
            onDrop={(e) => {
              e.preventDefault()
              const source = e.dataTransfer.getData('application/x-tiger-tab')
              if (source && drop) onReorder(source, tab.key, drop.side)
              setDrop(null)
            }}
            onDragEnd={() => setDrop(null)}
            onClick={() => onSelect(tab.key)}
            onContextMenu={(e) => {
              e.preventDefault()
              onTabMenu(tab.key, e.clientX, e.clientY)
            }}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return
              if (isContextMenuKey(e)) {
                e.preventDefault()
                const { x, y } = menuAnchor(e.currentTarget)
                onTabMenu(tab.key, x, y)
                return
              }
              const next = rovingIndex(e.key, index, tabs.length, 'horizontal')
              if (next !== null) {
                e.preventDefault()
                focusTab(tabs[next]?.key)
                return
              }
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(tab.key)
              } else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault()
                closeFromKeyboard(tab.key, index)
              }
            }}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                onClose(tab.key)
              }
            }}
          >
            {tab.kind === 'request' ? (
              <span className={`method-pill m-${tab.method}`} aria-hidden>
                {tab.method?.toUpperCase()}
              </span>
            ) : tab.kind === 'folder' ? (
              <FolderIcon size={13} />
            ) : (
              <BoxIcon size={13} />
            )}
            <span className="request-tab-name">{tab.label}</span>
            {tab.dirty && <span className="request-tab-dirty" aria-hidden />}
            <button
              type="button"
              className="request-tab-close"
              title={t('sidebar.tabs.closeTitle', { mod: MOD })}
              aria-label={t('sidebar.tabs.closeLabel', { label: tab.label })}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation()
                onClose(tab.key)
              }}
            >
              <CloseIcon size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
