import { Modal } from './Modal'

interface Props {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({ title, message, confirmLabel, onConfirm, onCancel }: Props) {
  return (
    <Modal title={title} onClose={onCancel} width={420}>
      <p style={{ margin: '0 0 18px', color: 'var(--text-dim)' }}>{message}</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
