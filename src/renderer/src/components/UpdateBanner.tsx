import { releaseNotesUrl, updateStatusText, type UpdateBanner as BannerKind, type UpdateState } from '@core/updateState'
import { CheckIcon, CloseIcon, DownloadIcon } from './Icons'
import { useT } from '../i18n'
import './UpdateBanner.css'

interface Props {
  kind: BannerKind
  state: UpdateState
  onRestart: () => void
  onDownload: () => void
  onLater: () => void
  onOpenExternal: (url: string) => void
}

/**
 * Non-modal update notice pinned to the bottom of the window: a slim progress
 * pill while downloading, then "ready, restart" with Restart now / Later.
 * Announcements happen in useUpdater, so nothing here is a live region (a
 * live progress line would read out every percent).
 */
export function UpdateBanner({ kind, state, onRestart, onDownload, onLater, onOpenExternal }: Props) {
  const t = useT()
  const version = 'version' in state ? state.version : undefined
  if (!kind || !version) return null
  const text = updateStatusText(state, t)
  const notes = (
    <button
      type="button"
      className="update-notes"
      onClick={() => onOpenExternal(releaseNotesUrl(version))}
    >
      {t('settings.update.releaseNotes')}
    </button>
  )

  if (kind === 'progress' && state.status === 'downloading') {
    return (
      <div className="update-ready update-progress" role="region" aria-label={t('settings.update.title')}>
        <DownloadIcon size={14} aria-hidden />
        <span className="update-text">{text}</span>
        <span className="update-bar" aria-hidden>
          <span style={{ width: `${state.percent}%` }} />
        </span>
        <button
          type="button"
          className="icon-btn"
          title={t('settings.update.hide')}
          aria-label={t('settings.update.hideProgress')}
          onClick={onLater}
        >
          <CloseIcon size={13} />
        </button>
      </div>
    )
  }

  const ready = kind === 'ready'
  return (
    <div className="update-ready" role="region" aria-label={t('settings.update.title')}>
      {ready ? <CheckIcon size={15} aria-hidden /> : <DownloadIcon size={15} aria-hidden />}
      <span className="update-text">{text}</span>
      {notes}
      <button type="button" className="btn" onClick={onLater}>
        {t('settings.update.later')}
      </button>
      {ready ? (
        <button type="button" className="btn accent" onClick={onRestart}>
          {t('settings.update.restartNow')}
        </button>
      ) : (
        <button type="button" className="btn accent" onClick={onDownload}>
          {t('settings.update.download')}
        </button>
      )}
    </div>
  )
}
