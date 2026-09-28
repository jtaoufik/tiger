import type { UpdateInfo } from '@core/version'
import { Modal } from './Modal'
import { DownloadIcon } from './Icons'

interface Props {
  info: UpdateInfo
  currentVersion: string
  onDownload: () => void
  onClose: () => void
}

export function UpdateModal({ info, currentVersion, onDownload, onClose }: Props) {
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
