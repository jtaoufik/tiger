import { useId, useRef, type ReactNode } from 'react'
import type { DocsPage } from '@core/actions'
import { CloseIcon } from './Icons'
import { HelpLink } from './HelpLink'
import { useDialog } from './useDialog'
import { useT } from '../i18n'
import './a11y.css'
import './Modal.css'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  width?: number
  /** 'alertdialog' for confirmations that interrupt the user. */
  role?: 'dialog' | 'alertdialog'
  /** Lead text under the header; becomes the dialog's accessible description. */
  description?: ReactNode
  /** Action row pinned under the body. Put Cancel first, the primary action last. */
  footer?: ReactNode
  className?: string
  /** Adds a "?" in the header linking the feature's website guide. */
  help?: { page: DocsPage; topic: string }
}

export function Modal({
  title,
  onClose,
  children,
  width = 560,
  role = 'dialog',
  description,
  footer,
  className,
  help
}: Props) {
  const t = useT()
  const backdropRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()
  useDialog(backdropRef, dialogRef, onClose)

  return (
    <div
      ref={backdropRef}
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className={`modal${className ? ` ${className}` : ''}`}
        style={{ width }}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        <div className="modal-head">
          <h2 id={titleId} className="modal-title" title={title}>
            {title}
          </h2>
          {help && <HelpLink page={help.page} topic={help.topic} />}
          <button
            type="button"
            className="icon-btn modal-close"
            onClick={onClose}
            title={t('modals.modal.closeTitle')}
            aria-label={t('modals.modal.closeLabel')}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="modal-body">
          {description && (
            <div id={descId} className="modal-desc">
              {description}
            </div>
          )}
          {children}
        </div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}
