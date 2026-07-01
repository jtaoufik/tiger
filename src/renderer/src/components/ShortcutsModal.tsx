import { Modal } from './Modal'
import './ShortcutsModal.css'

// Re-exported so existing imports keep working; the source of truth is platform.ts.
export { IS_MAC, MOD } from '../platform'
import { IS_MAC, MOD } from '../platform'

interface Shortcut {
  keys: string[]
  what: string
}

const GROUPS: Array<{ title: string; items: Shortcut[] }> = [
  {
    title: 'General',
    items: [
      { keys: [MOD, 'K'], what: 'Command palette: jump to any request' },
      { keys: [MOD, 'N'], what: 'New collection' },
      { keys: [MOD, 'O'], what: 'Open collection' },
      ...(IS_MAC ? [{ keys: [MOD, ','], what: 'Settings' }] : []),
      { keys: [MOD, '/'], what: 'Show this shortcuts overlay' }
    ]
  },
  {
    title: 'Request',
    items: [
      { keys: [MOD, 'Enter'], what: 'Send the request' },
      { keys: [MOD, 'S'], what: 'Save the request to disk' },
      { keys: [MOD, 'T'], what: 'New request in the active collection' },
      { keys: [MOD, 'L'], what: 'Focus the URL bar' },
      { keys: [MOD, 'F'], what: 'Search in the response' },
      { keys: ['F2'], what: 'Rename the selected request' }
    ]
  },
  {
    title: 'Tabs',
    items: [
      { keys: [MOD, 'W'], what: 'Close the active tab' },
      { keys: ['Ctrl', 'Tab'], what: 'Next tab' },
      { keys: ['Ctrl', 'Shift', 'Tab'], what: 'Previous tab' },
      { keys: [MOD, '1-9'], what: 'Jump to tab (9 is the last tab)' }
    ]
  }
]

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} width={520}>
      <div className="shortcuts">
        {GROUPS.map((g) => (
          <div key={g.title} className="shortcut-group">
            <div className="shortcut-group-title">{g.title}</div>
            {g.items.map((s) => (
              <div key={s.what} className="shortcut-row">
                <span className="shortcut-keys">
                  {s.keys.map((k) => (
                    <kbd key={k}>{k}</kbd>
                  ))}
                </span>
                <span className="shortcut-what">{s.what}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  )
}
