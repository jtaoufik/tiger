import type { UpdateInfo } from '@core/version'
import { releaseNotesUrl, updateStatusText, type UpdateState } from '@core/updateState'
import { Modal } from './Modal'
import { CheckIcon, DownloadIcon, RefreshIcon } from './Icons'
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
  return (
    <Modal
      title={`Update available · v${info.latest}`}
      onClose={onClose}
      width={480}
      description={`You are on v${currentVersion}. Version ${info.latest} is ready to download.`}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Later
          </button>
          <button type="button" className="btn accent" data-autofocus onClick={onDownload}>
            <DownloadIcon size={14} /> Download update
          </button>
        </>
      }
    >
      {info.notes.length > 0 && (
        <section aria-labelledby="update-notes-label">
          <h3 id="update-notes-label" className="section-label" style={{ marginTop: 0 }}>
            What changed
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
  const status = state.status
  const description =
    status === 'idle' || status === 'checking'
      ? 'Checking for updates…'
      : status === 'up-to-date'
        ? `Tiger ${currentVersion} is the latest version.`
        : updateStatusText(state)

  const notes =
    'version' in state && state.version ? (
      <button
        type="button"
        className="update-notes"
        onClick={() => onOpenExternal(releaseNotesUrl(state.version!))}
      >
        Release notes for {state.version}
      </button>
    ) : null

  let footer
  switch (status) {
    case 'available':
      footer = (
        <>
          <button type="button" className="btn" onClick={onClose}>
            Later
          </button>
          <button type="button" className="btn accent" data-autofocus onClick={onDownload}>
            <DownloadIcon size={14} /> Download
          </button>
        </>
      )
      break
    case 'downloaded':
      footer = (
        <>
          <button type="button" className="btn" onClick={onClose}>
            Later
          </button>
          <button type="button" className="btn accent" data-autofocus onClick={onRestart}>
            <CheckIcon size={14} /> Restart now
          </button>
        </>
      )
      break
    case 'error':
      footer = (
        <>
          <button type="button" className="btn" onClick={() => onOpenExternal(DOWNLOAD_PAGE)}>
            Download from website
          </button>
          <button type="button" className="btn accent" data-autofocus onClick={onRetry}>
            <RefreshIcon size={14} /> Try again
          </button>
        </>
      )
      break
    case 'downloading':
      footer = (
        <button type="button" className="btn" data-autofocus onClick={onClose}>
          Continue in background
        </button>
      )
      break
    default:
      footer = (
        <button type="button" className="btn" data-autofocus onClick={onClose}>
          {status === 'up-to-date' ? 'OK' : 'Close'}
        </button>
      )
  }

  return (
    <Modal
      title="Software update"
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
          aria-label={`Downloading update ${state.version}`}
        />
      )}
      {status === 'downloaded' && (
        <p style={{ margin: 0, color: 'var(--text-dim)' }}>
          Choose Later to install it the next time you quit Tiger.
        </p>
      )}
      {notes}
    </Modal>
  )
}
