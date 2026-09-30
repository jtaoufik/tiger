import { Modal } from './Modal'
import './a11y.css'
import './ShortcutsModal.css'

// Re-exported so existing imports keep working; the source of truth is platform.ts.
export { IS_MAC, MOD } from '../platform'
import { IS_MAC, MOD } from '../platform'
import { SHORTCUT_GROUPS, actionLabel, shortcutKeys, type ActionId } from '@core/actions'
import type { Translator } from '@core/i18n'
import { useT } from '../i18n'

/**
 * Shortcut groups come from the action registry (src/core/actions.ts), the
 * same source the native menu and the command palette read, so the overlay
 * can never list a shortcut or a name the rest of the app does not use.
 */
export function shortcutGroups(
  t: Translator
): Array<{ title: string; items: Array<{ id: ActionId; keys: string[]; what: string }> }> {
  return SHORTCUT_GROUPS.map((g) => ({
    title: t(g.titleKey),
    items: g.ids.map((id) => ({ id, keys: shortcutKeys(id, MOD), what: actionLabel(id, t) }))
  }))
}

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const t = useT()
  const groups = shortcutGroups(t)
  return (
    <Modal
      title={t('actions.shortcuts.label')}
      onClose={onClose}
      width={540}
      description={t(IS_MAC ? 'modals.shortcuts.descriptionMac' : 'modals.shortcuts.description', {
        mod: MOD
      })}
    >
      <div className="shortcuts">
        {groups.map((g, gi) => (
          <section key={SHORTCUT_GROUPS[gi].titleKey} className="shortcut-group" aria-labelledby={`sc-${gi}`}>
            <h3 id={`sc-${gi}`} className="shortcut-group-title">
              {g.title}
            </h3>
            <dl className="shortcut-list">
              {g.items.map((s) => (
                <div key={s.id} className="shortcut-row">
                  <dt className="shortcut-keys">
                    <span className="tg-sr-only">{s.keys.join(' + ')}</span>
                    <span className="shortcut-kbds" aria-hidden="true" dir="ltr">
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
