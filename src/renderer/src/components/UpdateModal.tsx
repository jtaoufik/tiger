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
    <Modal title={`Update available · v${info.latest}`} onClose={onClose} width={480}>
      <p style={{ margin: '0 0 14px', color: 'var(--text-dim)' }}>
        You are on v{currentVersion}. Version {info.latest} is ready to download.
      </p>
      {info.notes.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: 0 }}>
            What changed
          </div>
          <ul className="changelog">
            {info.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
        <button className="btn" onClick={onClose}>
          Later
        </button>
        <button className="btn accent" onClick={onDownload}>
          <DownloadIcon size={14} /> Download update
        </button>
      </div>
    </Modal>
  )
}
