import { useId, useState } from 'react'
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
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const errorId = useId()

  const submit = () => {
    const v = value.trim()
    if (!v) {
      setError(`${label} is required.`)
      return
    }
    onSubmit(v)
  }

  return (
    <Modal
      title={title}
      onClose={onCancel}
      width={440}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" form={`${inputId}-form`} className="btn accent">
            {confirmLabel}
          </button>
        </>
      }
    >
      <form
        id={`${inputId}-form`}
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor={inputId}>
            <span>{label}</span>
            <span className="req-mark" aria-hidden="true">
              (required)
            </span>
          </label>
          <input
            id={inputId}
            autoFocus
            required
            aria-required="true"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            value={value}
            placeholder={placeholder}
            spellCheck={false}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              setValue(e.target.value)
              if (error && e.target.value.trim()) setError(null)
            }}
          />
          {error && (
            <div id={errorId} className="field-error" role="alert">
              {error}
            </div>
          )}
        </div>
      </form>
    </Modal>
  )
}
