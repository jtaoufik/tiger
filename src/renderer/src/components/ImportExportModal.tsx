import type { ImportKind } from '../../../main/importers'
import { Modal } from './Modal'
import { CodeIcon, DownloadIcon, FileIcon, UploadIcon } from './Icons'

export type ExportFormat = 'postman' | 'tiger' | 'curl'

interface Props {
  collectionName: string | null
  requestName: string | null
  onImport: (kind: ImportKind) => void
  onExport: (format: ExportFormat) => void
  onClose: () => void
}

const IMPORTS: Array<{ kind: ImportKind; title: string; desc: string }> = [
  { kind: 'postman', title: 'Postman', desc: 'Collection v2.0 / v2.1 (.json)' },
  { kind: 'bruno', title: 'Bruno', desc: 'A folder of .bru files' },
  { kind: 'openapi', title: 'OpenAPI / Swagger', desc: 'OpenAPI 3 or Swagger 2 (.json / .yaml)' },
  { kind: 'insomnia', title: 'Insomnia', desc: 'Insomnia v4 export (.json / .yaml)' }
]

export function ImportExportModal({
  collectionName,
  requestName,
  onImport,
  onExport,
  onClose
}: Props) {
  return (
    <Modal title="Import / Export" onClose={onClose} width={600}>
      <div className="section-label" style={{ marginTop: 0 }}>
        Import a collection
      </div>
      <div className="choice-grid">
        {IMPORTS.map((item) => (
          <button key={item.kind} className="choice" onClick={() => onImport(item.kind)}>
            <span className="t">
              <UploadIcon size={15} />
              {item.title}
            </span>
            <span className="d">{item.desc}</span>
          </button>
        ))}
      </div>

      <div className="section-label">Export</div>
      <div className="choice-grid">
        <button
          className="choice"
          disabled={!collectionName}
          onClick={() => onExport('postman')}
          title={collectionName ? `Export "${collectionName}"` : 'No collection selected'}
        >
          <span className="t">
            <DownloadIcon size={15} />
            Postman collection
          </span>
          <span className="d">
            {collectionName
              ? `"${collectionName}" as a v2.1 .json file`
              : 'Select a request first'}
          </span>
        </button>
        <button
          className="choice"
          disabled={!requestName}
          onClick={() => onExport('tiger')}
          title={requestName ? `Export "${requestName}"` : 'No request selected'}
        >
          <span className="t">
            <FileIcon size={15} />
            Request as .tiger
          </span>
          <span className="d">
            {requestName ? `"${requestName}" as a .tiger file` : 'Select a request first'}
          </span>
        </button>
        <button
          className="choice"
          disabled={!requestName}
          onClick={() => onExport('curl')}
          title={requestName ? `Copy "${requestName}" as curl` : 'No request selected'}
        >
          <span className="t">
            <CodeIcon size={15} />
            Request as cURL
          </span>
          <span className="d">
            {requestName ? 'Copy a curl command to the clipboard' : 'Select a request first'}
          </span>
        </button>
      </div>
    </Modal>
  )
}
