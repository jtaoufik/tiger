import type { KeyValue, TigerEnvironment } from '@core/types'
import { KeyValueEditor } from './KeyValueEditor'
import { Modal } from './Modal'
import { NODE_MARK, withNode } from './withNode'
import { useT } from '../i18n'

interface Props {
  env: TigerEnvironment | null
  onChange: (variables: KeyValue[]) => void
  onClose: () => void
}

export function EnvironmentModal({ env, onChange, onClose }: Props) {
  const t = useT()
  return (
    <Modal
      title={env ? t('modals.environment.titleNamed', { name: env.name }) : t('modals.environment.title')}
      onClose={onClose}
      width={560}
      description={
        env ? (
          withNode(
            t('modals.environment.description', { token: NODE_MARK }),
            <span className="token">{'{{name}}'}</span>
          )
        ) : undefined
      }
    >
      {env ? (
        <>
          <h3 className="section-label" style={{ marginTop: 0 }}>
            {t('modals.environment.variables')}
          </h3>
          <KeyValueEditor
            items={env.variables}
            placeholder={[t('modals.environment.variable'), t('common.value')]}
            kind="variable"
            onChange={onChange}
          />
        </>
      ) : (
        <div className="modal-empty">
          <h3>{t('modals.environment.emptyTitle')}</h3>
          <p>
            {withNode(
              t('modals.environment.emptyBody', { folder: NODE_MARK }),
              // i18n-ignore: folder name
              <code>environments/</code>
            )}
          </p>
          <button type="button" className="btn" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      )}
    </Modal>
  )
}
