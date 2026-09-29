import { Modal } from './Modal'

interface Props {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  /** Most confirms delete or close something; pass false for a neutral action. */
  destructive?: boolean
}

export function ConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  destructive = true
}: Props) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      width={440}
      role="alertdialog"
      description={message}
      footer={
        <>
          {/* Cancel gets initial focus: Enter on a destructive dialog must be safe. */}
          <button type="button" className="btn" data-autofocus onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${destructive ? 'danger' : 'accent'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {null}
    </Modal>
  )
}
