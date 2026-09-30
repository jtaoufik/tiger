import type { UpdateInfo } from '@core/version'
import { releaseNotesUrl, updateStatusText, type UpdateState } from '@core/updateState'
import { Modal } from './Modal'
import { CheckIcon, DownloadIcon, RefreshIcon } from './Icons'
import { useT } from '../i18n'
import './UpdateBanner.css'

/** Website download page: the fallback when an in-app update cannot run. */
export const DOWNLOAD_PAGE = 'https://jtaoufik.github.io/tiger/#download'

type ManualProps = {
  kind: 'manual'
  info: UpdateInfo
  currentVersion: string
  onDownload: () => void
  onClose: () => void
}

type AutoProps = {
  kind: 'auto'
  state: UpdateState
  currentVersion: string
  onRetry: () => void
  onDownload: () => void
  onRestart: () => void
  onOpenExternal: (url: string) => void
  onClose: () => void
}

export function UpdateModal(props: ManualProps | AutoProps) {
  return props.kind === 'manual' ? <ManualUpdate {...props} /> : <AutoUpdate {...props} />
}

/** Website-link flow: dev, Store, .deb, tar.gz and the Windows portable builds. */
function ManualUpdate({ info, currentVersion, onDownload, onClose }: ManualProps) {
  const t = useT()
  return (
    <Modal
      title={t('settings.update.manualTitle', { version: info.latest })}
      onClose={onClose}
      width={480}
      description={t('settings.update.manualDesc', { current: currentVersion, latest: info.latest })}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t('settings.update.later')}
          </button>
          <button type="button" className="btn accent" data-autofocus onClick={onDownload}>
            <DownloadIcon size={14} /> {t('settings.update.downloadUpdate')}
          </button>
        </>
      }
    >
      {info.notes.length > 0 && (
        <section aria-labelledby="update-notes-label">
          <h3 id="update-notes-label" className="section-label" style={{ marginTop: 0 }}>
            {t('settings.update.whatChanged')}
          </h3>
          <ul className="changelog">
            {info.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </section>
      )}
    </Modal>
  )
}

/** In-app flow (electron-updater): checking, up to date, downloading, ready, error. */
function AutoUpdate({
  state,
  currentVersion,
  onRetry,
  onDownload,
  onRestart,
  onOpenExternal,
  onClose
}: AutoProps) {
  const t = useT()
  const status = state.status
  const description =
    status === 'idle' || status === 'checking'
      ? t('settings.update.status.checking')
      : status === 'up-to-date'
        ? t('settings.update.upToDateVersion', { version: currentVersion })
        : updateStatusText(state, t)

  const notes =
    'version' in state && state.version ? (
      <button
        type="button"
        className="update-notes"
        onClick={() => onOpenExternal(releaseNotesUrl(state.version!))}
      >
        {t('settings.update.releaseNotesFor', { version: state.version })}
      </button>
    ) : null

  let footer
  switch (status) {
    case 'available':
      footer = (
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t('settings.update.later')}
          </button>
          <button type="button" className="btn accent" data-autofocus onClick={onDownload}>
            <DownloadIcon size={14} /> {t('settings.update.download')}
          </button>
        </>
      )
      break
    case 'downloaded':
      footer = (
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t('settings.update.later')}
          </button>
          <button type="button" className="btn accent" data-autofocus onClick={onRestart}>
            <CheckIcon size={14} /> {t('settings.update.restartNow')}
          </button>
        </>
      )
      break
    case 'error':
      footer = (
        <>
          <button type="button" className="btn" onClick={() => onOpenExternal(DOWNLOAD_PAGE)}>
            {t('settings.update.downloadFromWebsite')}
          </button>
          <button type="button" className="btn accent" data-autofocus onClick={onRetry}>
            <RefreshIcon size={14} /> {t('common.retry')}
          </button>
        </>
      )
      break
    case 'downloading':
      footer = (
        <button type="button" className="btn" data-autofocus onClick={onClose}>
          {t('settings.update.continueInBackground')}
        </button>
      )
      break
    default:
      footer = (
        <button type="button" className="btn" data-autofocus onClick={onClose}>
          {status === 'up-to-date' ? t('common.ok') : t('common.close')}
        </button>
      )
  }

  return (
    <Modal
      title={t('settings.update.title')}
      onClose={onClose}
      width={440}
      description={description}
      footer={footer}
    >
      {status === 'downloading' && (
        <progress
          className="update-modal-progress"
          max={100}
          value={state.percent}
          aria-label={t('settings.update.downloadingAria', { version: state.version })}
        />
      )}
      {status === 'downloaded' && (
        <p style={{ margin: 0, color: 'var(--text-dim)' }}>
          {t('settings.update.laterHint')}
        </p>
      )}
      {notes}
    </Modal>
  )
}
