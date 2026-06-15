import { useState } from 'react'
import type { ImportKind } from '../../../main/importers'
import { Modal } from './Modal'
import { CodeIcon, DownloadIcon, FileIcon, GlobeIcon, UploadIcon } from './Icons'

export type ExportFormat = 'postman' | 'openapi' | 'environment' | 'tiger' | 'curl'

interface Props {
  collectionName: string | null
  requestName: string | null
  environmentName: string | null
  onImport: (kind: ImportKind) => void
  onImportCurl: (command: string) => void
  onExport: (format: ExportFormat) => void
  onClose: () => void
}

const IMPORTS: Array<{ kind: ImportKind; title: string; desc: string }> = [
  { kind: 'postman', title: 'Postman', desc: 'A .json file, many files, or a folder' },
  { kind: 'bruno', title: 'Bruno', desc: 'A folder of .bru files (nested OK)' },
  { kind: 'openapi', title: 'OpenAPI / Swagger', desc: 'A .json / .yaml spec, many, or a folder' },
  { kind: 'insomnia', title: 'Insomnia', desc: 'A .json / .yaml export, many, or a folder' },
  { kind: 'wsdl', title: 'WSDL / SOAP', desc: 'A .wsdl / .xml service, many, or a folder' }
]

export function ImportExportModal({
  collectionName,
  requestName,
  environmentName,
  onImport,
  onImportCurl,
  onExport,
  onClose
}: Props) {
  const [curl, setCurl] = useState('')
  const [showCurl, setShowCurl] = useState(false)
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

      {showCurl ? (
        <div style={{ marginTop: 10 }}>
          <textarea
            className="code-area"
            style={{ minHeight: 90, border: '1px solid var(--border-strong)', borderRadius: 9, padding: 10 }}
            placeholder="Paste a curl command…"
            value={curl}
            spellCheck={false}
            onChange={(e) => setCurl(e.target.value)}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button className="btn" onClick={() => setShowCurl(false)}>Cancel</button>
            <button className="btn accent" disabled={!curl.trim()} onClick={() => onImportCurl(curl)}>
              Import request
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn ghost"
          style={{ marginTop: 10 }}
          onClick={() => setShowCurl(true)}
        >
          <CodeIcon size={14} /> Paste a cURL command
        </button>
      )}

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
          disabled={!collectionName}
          onClick={() => onExport('openapi')}
          title={collectionName ? `Export "${collectionName}" as OpenAPI` : 'No collection selected'}
        >
          <span className="t">
            <DownloadIcon size={15} />
            OpenAPI / Swagger
          </span>
          <span className="d">
            {collectionName
              ? `"${collectionName}" as an OpenAPI 3.0 .json file`
              : 'Select a request first'}
          </span>
        </button>
        <button
          className="choice"
          disabled={!environmentName}
          onClick={() => onExport('environment')}
          title={environmentName ? `Export environment "${environmentName}"` : 'No active environment'}
        >
          <span className="t">
            <GlobeIcon size={15} />
            Active environment
          </span>
          <span className="d">
            {environmentName ? `"${environmentName}" as a Postman environment` : 'No active environment'}
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
