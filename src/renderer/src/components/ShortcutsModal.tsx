import { Modal } from './Modal'
import './a11y.css'
import './ShortcutsModal.css'

// Re-exported so existing imports keep working; the source of truth is platform.ts.
export { IS_MAC, MOD } from '../platform'
import { IS_MAC, MOD } from '../platform'
import { SHORTCUT_GROUPS, getAction, shortcutKeys, type ActionId } from '@core/actions'

/**
 * Shortcut groups come from the action registry (src/core/actions.ts), the
 * same source the native menu and the command palette read, so the overlay
 * can never list a shortcut or a name the rest of the app does not use.
 */
export const GROUPS: Array<{ title: string; items: Array<{ id: ActionId; keys: string[]; what: string }> }> =
  SHORTCUT_GROUPS.map((g) => ({
    title: g.title,
    items: g.ids.map((id) => ({ id, keys: shortcutKeys(id, MOD), what: getAction(id).label }))
  }))

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Keyboard shortcuts"
      onClose={onClose}
      width={540}
      description={`${MOD} is the ${IS_MAC ? 'Command' : 'Control'} key. Every command is also in the command palette (${MOD}+K).`}
    >
      <div className="shortcuts">
        {GROUPS.map((g) => (
          <section key={g.title} className="shortcut-group" aria-labelledby={`sc-${g.title}`}>
            <h3 id={`sc-${g.title}`} className="shortcut-group-title">
              {g.title}
            </h3>
            <dl className="shortcut-list">
              {g.items.map((s) => (
                <div key={s.id} className="shortcut-row">
                  <dt className="shortcut-keys">
                    <span className="tg-sr-only">{s.keys.join(' + ')}</span>
                    <span className="shortcut-kbds" aria-hidden="true">
                      {s.keys.map((k) => (
                        <kbd key={k}>{k}</kbd>
                      ))}
                    </span>
                  </dt>
                  <dd className="shortcut-what">{s.what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  )
}
