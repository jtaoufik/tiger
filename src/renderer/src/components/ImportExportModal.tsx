import { useEffect, useId, useRef, useState } from 'react'
import type { ImportKind } from '../../../main/importers'
import { Modal } from './Modal'
import { useT } from '../i18n'
import type { MessageKey } from '@core/i18n'
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

const IMPORTS: Array<{ kind: ImportKind; title: string; descKey: MessageKey }> = [
  { kind: 'postman', title: 'Postman', descKey: 'modals.importExport.descPostman' },
  { kind: 'bruno', title: 'Bruno', descKey: 'modals.importExport.descBruno' },
  // i18n-ignore: product names
  { kind: 'openapi', title: 'OpenAPI / Swagger', descKey: 'modals.importExport.descOpenapi' },
  { kind: 'insomnia', title: 'Insomnia', descKey: 'modals.importExport.descInsomnia' },
  // i18n-ignore: product names
  { kind: 'wsdl', title: 'WSDL / SOAP', descKey: 'modals.importExport.descWsdl' }
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
  const t = useT()
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
      title={t('modals.importExport.title')}
      onClose={onClose}
      width={600}
      help={{ page: 'importing', topic: t('modals.importExport.topic') }}
    >
      <h3 className="section-label" style={{ marginTop: 0 }} id={`${uid}-import`}>
        {t('modals.importExport.importHeading')}
      </h3>
      <div className="choice-grid" role="group" aria-labelledby={`${uid}-import`}>
        {IMPORTS.map((item) => (
          <button type="button" key={item.kind} className="choice" onClick={() => onImport(item.kind)}>
            <span className="t">
              <UploadIcon size={15} />
              {item.title}
            </span>
            <span className="d">{t(item.descKey)}</span>
          </button>
        ))}
      </div>

      {showCurl ? (
        <div className="curl-box">
          <label className="curl-label" htmlFor={`${uid}-curl`}>
            {t('modals.importExport.curlLabel')}
          </label>
          <textarea
            id={`${uid}-curl`}
            ref={curlRef}
            className="code-area curl-area"
            placeholder={t('modals.importExport.curlPlaceholder')}
            aria-describedby={`${uid}-curl-hint`}
            value={curl}
            spellCheck={false}
            onChange={(e) => setCurl(e.target.value)}
          />
          <div id={`${uid}-curl-hint`} className="curl-hint">
            {t('modals.importExport.curlHint', {
              example: `curl -X POST https://api.example.com/users -H "Content-Type: application/json" -d '{"name":"Ada"}'`
            })}
          </div>
          <div className="modal-actions" style={{ marginTop: 8 }}>
            <button type="button" className="btn" onClick={() => setShowCurl(false)}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn accent"
              disabled={!curl.trim()}
              onClick={() => onImportCurl(curl)}
            >
              {t('modals.importExport.importRequest')}
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
          <CodeIcon size={14} /> {t('modals.importExport.pasteCurl')}
        </button>
      )}

      <h3 className="section-label" id={`${uid}-export`}>
        {t('modals.importExport.exportHeading')}
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
          title={
            collectionName
              ? t('modals.importExport.exportTitle', { name: collectionName })
              : t('modals.importExport.noCollection')
          }
        >
          <span className="t">
            <DownloadIcon size={15} />
            {t('modals.importExport.postmanCollection')}
          </span>
          <span className="d">
            {collectionName
              ? t('modals.importExport.postmanDesc', { name: collectionName })
              : t('modals.importExport.selectRequestFirst')}
          </span>
        </button>
        <button
          type="button"
          className="choice"
          disabled={!collectionName}
          onClick={() => onExport('openapi')}
          title={
            collectionName
              ? t('modals.importExport.openapiTitle', { name: collectionName })
              : t('modals.importExport.noCollection')
          }
        >
          <span className="t">
            <DownloadIcon size={15} />
            {/* i18n-ignore: product name */}
            OpenAPI / Swagger
          </span>
          <span className="d">
            {collectionName
              ? t('modals.importExport.openapiDesc', { name: collectionName })
              : t('modals.importExport.selectRequestFirst')}
          </span>
        </button>
        <button
          type="button"
          className="choice"
          disabled={!environmentName}
          onClick={() => onExport('environment')}
          title={
            environmentName
              ? t('modals.importExport.envTitle', { name: environmentName })
              : t('modals.importExport.noEnvironment')
          }
        >
          <span className="t">
            <GlobeIcon size={15} />
            {t('modals.importExport.activeEnvironment')}
          </span>
          <span className="d">
            {environmentName
              ? t('modals.importExport.envDesc', { name: environmentName })
              : t('modals.importExport.noEnvironment')}
          </span>
        </button>
        <button
          type="button"
          className="choice"
          disabled={!requestName}
          onClick={() => onExport('tiger')}
          title={
            requestName
              ? t('modals.importExport.exportTitle', { name: requestName })
              : t('modals.importExport.noRequest')
          }
        >
          <span className="t">
            <FileIcon size={15} />
            {t('modals.importExport.requestTiger')}
          </span>
          <span className="d">
            {requestName
              ? t('modals.importExport.tigerDesc', { name: requestName })
              : t('modals.importExport.selectRequestFirst')}
          </span>
        </button>
        <button
          type="button"
          className="choice"
          disabled={!requestName}
          onClick={() => onExport('curl')}
          title={
            requestName
              ? t('modals.importExport.copyCurlTitle', { name: requestName })
              : t('modals.importExport.noRequest')
          }
        >
          <span className="t">
            <CodeIcon size={15} />
            {t('modals.importExport.copyCurl')}
          </span>
          <span className="d">
            {requestName
              ? t('modals.importExport.copyCurlDesc')
              : t('modals.importExport.selectRequestFirst')}
          </span>
        </button>
      </div>
    </Modal>
  )
}
