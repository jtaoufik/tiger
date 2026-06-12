/**
 * Workspace tabs (Postman-style). A tab is a request, a collection page or a
 * folder page. Labels and methods come from the App's collections state at
 * render time, so renames stay in sync. Middle-click closes a tab.
 */
import { useEffect, useRef } from 'react'
import type { HttpMethod } from '@core/types'
import { BoxIcon, CloseIcon, FolderIcon } from './Icons'
import './RequestTabs.css'

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
}

export function RequestTabs({ tabs, activeKey, onSelect, onClose, onTabMenu }: RequestTabsProps) {
  const stripRef = useRef<HTMLDivElement>(null)

  // Keep the active tab visible when activating or opening at the end.
  useEffect(() => {
    const el = stripRef.current?.querySelector('.request-tab.active') as HTMLElement | null
    el?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' })
  }, [activeKey, tabs.length])

  return (
    <div className="request-tabs" role="tablist" ref={stripRef}>
      {tabs.map((tab) => (
        <div
          key={tab.key}
          role="tab"
          aria-selected={tab.key === activeKey}
          tabIndex={0}
          className={`request-tab${tab.key === activeKey ? ' active' : ''}`}
          title={tab.label}
          onClick={() => onSelect(tab.key)}
          onContextMenu={(e) => {
            e.preventDefault()
            onTabMenu(tab.key, e.clientX, e.clientY)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onSelect(tab.key)
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
            <span className={`method-pill m-${tab.method}`}>{tab.method?.toUpperCase()}</span>
          ) : tab.kind === 'folder' ? (
            <FolderIcon size={13} />
          ) : (
            <BoxIcon size={13} />
          )}
          <span className="request-tab-name">{tab.label}</span>
          {tab.dirty && <span className="request-tab-dirty" title="Unsaved changes" />}
          <button
            className="request-tab-close"
            title="Close tab (Cmd/Ctrl+W)"
            onClick={(e) => {
              e.stopPropagation()
              onClose(tab.key)
            }}
          >
            <CloseIcon size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
