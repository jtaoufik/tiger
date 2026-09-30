import { useId } from 'react'
import type { ImportSummary } from '@core/import'
import type { MessageKey, Vars } from '@core/i18n'
import { t as translate, useT } from '../i18n'
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

/** One sentence for screen readers and the toast. */
export function importReportSentence(summary: ImportSummary, tr: (key: MessageKey, vars?: Vars) => string = translate): string {
  const vars = {
    requests: tr('imports.report.requestsCount', { count: summary.requests }),
    folders: tr('imports.report.foldersCount', { count: summary.folders }),
    environments: tr('imports.report.environmentsCount', { count: summary.environments }),
    name: summary.name
  }
  return summary.items.length
    ? tr('imports.report.sentenceCheck', {
        ...vars,
        items: tr('imports.report.itemsCount', { count: summary.items.length })
      })
    : tr('imports.report.sentenceClean', vars)
}

/** What an import brought in, and what only came in partly. */
export function ImportReportModal({ summary, environmentsTarget, selectedEnvironment, onClose }: Props) {
  const uid = useId()
  const t = useT()
  const stats = [
    { icon: <FileIcon size={16} />, value: summary.requests, label: t('imports.report.requests', { count: summary.requests }) },
    { icon: <FolderIcon size={16} />, value: summary.folders, label: t('imports.report.folders', { count: summary.folders }) },
    {
      icon: <GlobeIcon size={16} />,
      value: summary.environments,
      label: t('imports.report.environments', { count: summary.environments })
    }
  ]
  const description = environmentsTarget
    ? t('imports.report.descEnvironmentsTarget', { target: environmentsTarget })
    : selectedEnvironment
      ? t('imports.report.descSelectedEnvironment', { name: summary.name, environment: selectedEnvironment })
      : t('imports.report.descOpen', { name: summary.name })

  return (
    <Modal
      title={t('imports.report.title', { name: summary.name })}
      onClose={onClose}
      width={600}
      className="import-report"
      description={description}
      help={{ page: 'importing', topic: t('modals.importExport.topic') }}
      footer={
        <button type="button" className="btn accent" onClick={onClose} data-autofocus>
          {t('common.done')}
        </button>
      }
    >
      <dl className="import-report-stats" aria-label={t('imports.report.statsLabel')}>
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
          {t('imports.report.clean')}
        </p>
      ) : (
        <section aria-labelledby={`${uid}-check`}>
          <h3 className="section-label import-report-head" id={`${uid}-check`}>
            <WarningIcon size={15} aria-hidden="true" />
            {summary.items.length === 1
              ? t('imports.report.checkOne')
              : t('imports.report.checkMany', { count: summary.items.length })}
          </h3>
          <p className="import-report-hint">
            {t('imports.report.hint')}
          </p>
          <ul className="import-report-list">
            {summary.items.map((item, i) => (
              <li key={`${item.path.join('/')}-${item.request ?? ''}-${i}`} className="import-report-item">
                <div className="import-report-name">
                  {item.request ?? summary.name}
                  {item.path.length > 0 && (
                    <span className="import-report-path">
                      <span className="tg-sr-only">{t('imports.report.in')} </span>
                      {item.path.join(' / ')}
                    </span>
                  )}
                </div>
                <ul className="import-report-messages">
                  {item.messages.map((m, mi) => {
                    const i18n = item.i18n?.[mi]
                    return <li key={m}>{i18n ? t(i18n.key, i18n.vars) : m}</li>
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Modal>
  )
}
