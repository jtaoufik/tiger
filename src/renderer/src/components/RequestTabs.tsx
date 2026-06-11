/**
 * Open-request tabs (Postman-style) shown at the top of the workspace. Names
 * and methods come from the collections state at render time, so they stay in
 * sync with sidebar renames. Middle-click closes a tab, like a browser.
 */
import type { HttpMethod } from '@core/types'
import { CloseIcon } from './Icons'
import './RequestTabs.css'

export interface RequestTab {
  id: string
  name: string
  method: HttpMethod
}

interface RequestTabsProps {
  tabs: RequestTab[]
  activeId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
}

export function RequestTabs({ tabs, activeId, onSelect, onClose }: RequestTabsProps) {
  return (
    <div className="request-tabs" role="tablist">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeId}
          tabIndex={0}
          className={`request-tab${tab.id === activeId ? ' active' : ''}`}
          title={tab.name}
          onClick={() => onSelect(tab.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onSelect(tab.id)
            }
          }}
          onAuxClick={(e) => {
            // Middle-click closes, like browser tabs.
            if (e.button === 1) {
              e.preventDefault()
              onClose(tab.id)
            }
          }}
        >
          <span className={`method-pill m-${tab.method}`}>{tab.method.toUpperCase()}</span>
          <span className="request-tab-name">{tab.name}</span>
          <button
            className="request-tab-close"
            title="Close tab"
            onClick={(e) => {
              e.stopPropagation()
              onClose(tab.id)
            }}
          >
            <CloseIcon size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
