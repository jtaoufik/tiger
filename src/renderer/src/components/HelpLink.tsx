import { docsUrl, type DocsPage } from '@core/actions'
import { HelpIcon } from './Icons'
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
  return (
    <button
      type="button"
      className="icon-btn help-link"
      title={`${topic} guide (opens in your browser)`}
      aria-label={`Help: ${topic} (opens in your browser)`}
      onClick={() => openExternal(docsUrl(page))}
    >
      <HelpIcon size={15} />
    </button>
  )
}
