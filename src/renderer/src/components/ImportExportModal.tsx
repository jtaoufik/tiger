import { useEffect, useId, useRef, useState } from 'react'
import type { ImportKind } from '../../../main/importers'
import { Modal } from './Modal'
import { CodeIcon, DownloadIcon, FileIcon, GlobeIcon, UploadIcon } from './Icons'
import './ImportExportModal.css'

export type ExportFormat = 'postman' | 'openapi' | 'environment' | 'tiger' | 'curl'

interface Props {
  collectionName: string | null
  requestName: string | null
  environmentName: string | null
  onImport: (kind: ImportKind) => void
  onImportCurl: (command: string) => void
  onExport: (format: ExportFormat) => void
  onClose: () => void
  /** Which half the entry point asked for; 'export' moves focus to it. */
  focus?: 'import' | 'export'
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
  onClose,
  focus = 'import'
}: Props) {
  const [curl, setCurl] = useState('')
  const [showCurl, setShowCurl] = useState(false)
  const uid = useId()
  const curlRef = useRef<HTMLTextAreaElement>(null)
  const curlToggleRef = useRef<HTMLButtonElement>(null)
  const curlWasOpen = useRef(false)
  const exportRef = useRef<HTMLDivElement>(null)
  // "Export" entry points land on the export half, not on the importers.
  useEffect(() => {
    if (focus !== 'export') return
    const first = exportRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')
    exportRef.current?.scrollIntoView?.({ block: 'nearest' })
    first?.focus()
  }, [focus])
  // Opening the paste box focuses it; closing returns focus to its toggle.
  useEffect(() => {
    if (showCurl) curlRef.current?.focus()
    else if (curlWasOpen.current) curlToggleRef.current?.focus()
    curlWasOpen.current = showCurl
  }, [showCurl])
  return (
    <Modal
      title="Import and export"
      onClose={onClose}
      width={600}
      help={{ page: 'importing', topic: 'Importing and exporting' }}
    >
      <h3 className="section-label" style={{ marginTop: 0 }} id={`${uid}-import`}>
        Import a collection
      </h3>
      <div className="choice-grid" role="group" aria-labelledby={`${uid}-import`}>
        {IMPORTS.map((item) => (
          <button type="button" key={item.kind} className="choice" onClick={() => onImport(item.kind)}>
            <span className="t">
              <UploadIcon size={15} />
              {item.title}
            </span>
            <span className="d">{item.desc}</span>
          </button>
        ))}
      </div>

      {showCurl ? (
        <div className="curl-box">
          <label className="curl-label" htmlFor={`${uid}-curl`}>
            curl command
          </label>
          <textarea
            id={`${uid}-curl`}
            ref={curlRef}
            className="code-area curl-area"
            placeholder="Paste a curl command…"
            aria-describedby={`${uid}-curl-hint`}
            value={curl}
            spellCheck={false}
            onChange={(e) => setCurl(e.target.value)}
          />
          <div id={`${uid}-curl-hint`} className="curl-hint">
            {`For example: curl -X POST https://api.example.com/users -H "Content-Type: application/json" -d '{"name":"Ada"}'`}
          </div>
          <div className="modal-actions" style={{ marginTop: 8 }}>
            <button type="button" className="btn" onClick={() => setShowCurl(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn accent"
              disabled={!curl.trim()}
              onClick={() => onImportCurl(curl)}
            >
              Import request
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          ref={curlToggleRef}
          className="btn ghost"
          style={{ marginTop: 10 }}
          aria-expanded={false}
          onClick={() => setShowCurl(true)}
        >
          <CodeIcon size={14} /> Paste a curl command
        </button>
      )}

      <h3 className="section-label" id={`${uid}-export`}>
        Export
      </h3>
      <div
        ref={exportRef}
        className="choice-grid"
        role="group"
        aria-labelledby={`${uid}-export`}
      >
        <button
          type="button"
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
          type="button"
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
          type="button"
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
          type="button"
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
          type="button"
          className="choice"
          disabled={!requestName}
          onClick={() => onExport('curl')}
          title={requestName ? `Copy "${requestName}" as curl` : 'No request selected'}
        >
          <span className="t">
            <CodeIcon size={15} />
            Copy as curl
          </span>
          <span className="d">
            {requestName ? 'Copy a curl command to the clipboard' : 'Select a request first'}
          </span>
        </button>
      </div>
    </Modal>
  )
}
