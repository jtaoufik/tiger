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
    <Modal
      title={env ? `Environment · ${env.name}` : 'Environment'}
      onClose={onClose}
      width={560}
      description={
        env ? (
          <>
            Reference these anywhere with <span className="token">{'{{name}}'}</span>.
          </>
        ) : undefined
      }
    >
      {env ? (
        <>
          <h3 className="section-label" style={{ marginTop: 0 }}>
            Variables
          </h3>
          <KeyValueEditor
            items={env.variables}
            placeholder={['Variable', 'Value']}
            noun="Variable"
            onChange={onChange}
          />
        </>
      ) : (
        <div className="modal-empty">
          <h3>No environment selected</h3>
          <p>
            Choose one from the top bar, or open a collection that has an
            <code> environments/</code> folder.
          </p>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      )}
    </Modal>
  )
}
