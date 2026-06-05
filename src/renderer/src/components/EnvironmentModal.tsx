import type { KeyValue, TigerEnvironment } from '@core/types'
import { KeyValueEditor } from './KeyValueEditor'
import { Modal } from './Modal'

interface Props {
  env: TigerEnvironment | null
  onChange: (variables: KeyValue[]) => void
  onClose: () => void
}

export function EnvironmentModal({ env, onChange, onClose }: Props) {
  return (
    <Modal title={env ? `Environment · ${env.name}` : 'Environment'} onClose={onClose} width={560}>
      {env ? (
        <>
          <div className="section-label">Variables</div>
          <KeyValueEditor
            items={env.variables}
            placeholder={['Variable', 'Value']}
            onChange={onChange}
          />
          <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 10 }}>
            Reference these anywhere with <span className="token">{'{{name}}'}</span>.
          </div>
        </>
      ) : (
        <div style={{ color: 'var(--text-dim)' }}>
          No environment selected. Choose one from the top bar, or open a collection that has an
          <code> environments/</code> folder.
        </div>
      )}
    </Modal>
  )
}
