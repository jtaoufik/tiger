import { useState } from 'react'
import { Modal } from './Modal'

interface Props {
  title: string
  label: string
  placeholder?: string
  confirmLabel?: string
  initialValue?: string
  onSubmit: (value: string) => void
  onCancel: () => void
}

/** In-app single-field prompt. Electron blocks window.prompt, so use this. */
export function PromptModal({
  title,
  label,
  placeholder,
  confirmLabel = 'OK',
  initialValue = '',
  onSubmit,
  onCancel
}: Props) {
  const [value, setValue] = useState(initialValue)
  const submit = () => {
    if (value.trim()) onSubmit(value.trim())
  }
  return (
    <Modal title={title} onClose={onCancel} width={440}>
      <div className="field" style={{ marginBottom: 16 }}>
        <label>{label}</label>
        <input
          autoFocus
          value={value}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn accent" disabled={!value.trim()} onClick={submit}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
