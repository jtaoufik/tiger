import { useId } from 'react'
import type { ImportSummary } from '@core/import'
import { Modal } from './Modal'
import { CircleCheckIcon, FileIcon, FolderIcon, GlobeIcon, WarningIcon } from './Icons'
import './ImportReportModal.css'

interface Props {
  summary: ImportSummary
  /** Where the environments went when the export held no requests. */
  environmentsTarget?: string
  /** The imported environment Tiger selected, if any. */
  selectedEnvironment?: string
  onClose: () => void
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** One sentence for screen readers and the toast. */
export function importReportSentence(summary: ImportSummary): string {
  const parts = [
    plural(summary.requests, 'request'),
    plural(summary.folders, 'folder'),
    plural(summary.environments, 'environment')
  ]
  const check = summary.items.length
    ? ` ${plural(summary.items.length, 'item')} to check.`
    : ' Everything mapped cleanly.'
  return `Imported ${parts.join(', ')} from ${summary.name}.${check}`
}

/** What an import brought in, and what only came in partly. */
export function ImportReportModal({ summary, environmentsTarget, selectedEnvironment, onClose }: Props) {
  const uid = useId()
  const stats = [
    { icon: <FileIcon size={16} />, value: summary.requests, label: summary.requests === 1 ? 'request' : 'requests' },
    { icon: <FolderIcon size={16} />, value: summary.folders, label: summary.folders === 1 ? 'folder' : 'folders' },
    {
      icon: <GlobeIcon size={16} />,
      value: summary.environments,
      label: summary.environments === 1 ? 'environment' : 'environments'
    }
  ]
  const description = environmentsTarget
    ? `The environments were added to ${environmentsTarget}. Pick one from the environment menu.`
    : selectedEnvironment
      ? `${summary.name} is open in the sidebar, with the "${selectedEnvironment}" environment selected.`
      : `${summary.name} is open in the sidebar.`

  return (
    <Modal
      title={`Imported ${summary.name}`}
      onClose={onClose}
      width={600}
      className="import-report"
      description={description}
      help={{ page: 'importing', topic: 'Importing and exporting' }}
      footer={
        <button type="button" className="btn accent" onClick={onClose} data-autofocus>
          Done
        </button>
      }
    >
      <dl className="import-report-stats" aria-label="Imported">
        {stats.map((s) => (
          <div key={s.label} className="import-report-stat">
            <dt>
              <span aria-hidden="true">{s.icon}</span>
              {s.label}
            </dt>
            <dd>{s.value}</dd>
          </div>
        ))}
      </dl>

      {summary.items.length === 0 ? (
        <p className="import-report-clean">
          <CircleCheckIcon size={16} aria-hidden="true" />
          Everything mapped cleanly. Nothing to check.
        </p>
      ) : (
        <section aria-labelledby={`${uid}-check`}>
          <h3 className="section-label import-report-head" id={`${uid}-check`}>
            <WarningIcon size={15} aria-hidden="true" />
            Check {summary.items.length === 1 ? 'this' : `these ${summary.items.length}`}
          </h3>
          <p className="import-report-hint">
            These came across only partly. Everything is kept, so you can fix it in place.
          </p>
          <ul className="import-report-list">
            {summary.items.map((item, i) => (
              <li key={`${item.path.join('/')}-${item.request ?? ''}-${i}`} className="import-report-item">
                <div className="import-report-name">
                  {item.request ?? summary.name}
                  {item.path.length > 0 && (
                    <span className="import-report-path">
                      <span className="tg-sr-only">in </span>
                      {item.path.join(' / ')}
                    </span>
                  )}
                </div>
                <ul className="import-report-messages">
                  {item.messages.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Modal>
  )
}
