import { docsUrl, type DocsPage } from '@core/actions'
import { HelpIcon } from './Icons'
import { useT } from '../i18n'
import './HelpLink.css'

/** Open a URL in the system browser (desktop) or a new tab (browser preview). */
export function openExternal(url: string): void {
  if (window.tiger?.openExternal) void window.tiger.openExternal(url)
  else window.open(url, '_blank', 'noopener')
}

/**
 * The "?" next to a complex panel: opens that feature's guide on the website.
 * `topic` names the feature for screen readers ("Help: Environments").
 */
export function HelpLink({ page, topic }: { page: DocsPage; topic: string }) {
  const t = useT()
  return (
    <button
      type="button"
      className="icon-btn help-link"
      title={t('modals.help.title', { topic })}
      aria-label={t('modals.help.label', { topic })}
      onClick={() => openExternal(docsUrl(page))}
    >
      <HelpIcon size={15} />
    </button>
  )
}
